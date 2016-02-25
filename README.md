
# challenge-accepted

__A composable testing framework__ based on hardcore functional programming and promise thunks.
Asynchronous is first class citizen (no `async/await`, `.then()`, `yield`, or chained method calls),
intended for writing acceptance tests. Has very good logging support.


## Example

TODO: Extract example.


## Implementation

### A Test

First, let’s define what a test is. It’s something that…

- Has two outcomes: success or failure.
- Takes some time to run.

This is exactly an async function!
Let’s take this moment to formalize this:

Running the test is as simple as this:

```js
// run.js
// @flow
import Promise from 'bluebird'
const run
  : (test: Thunk) => void
  = test => Promise.try(test).done()
export default run
```

And here’s our CLI:

```js
// cli.js
import run from './run'
const argv = require('minimist')(process.argv.slice(2))
const testModule = require(require('fs').realpathSync(argv._[0]))
run(testModule.default || testModule)
```

Let’s run our first test. Here’s a passing one:

```js
// test/basic.js
// @flow
import assert from 'assert'
import Promise from 'bluebird'
export default () => {
  assert.equal(1 + 1, 2)
}
```

And here’s a failing one:

```js
// test/basic.fail.js
// @flow
import assert from 'assert'
import Promise from 'bluebird'
export default () => {
  assert.equal(1 + 1, 1)
}
```

So this will be our building block.


### A Promise Thunk

Let’s specialize this a bit.
A promise thunk is a thunk that does not take any argument — although it may returns a value.

```js
// _/interfaces/thunk.js
type Thunk<T> = () => MaybePromise<T>
```


### Higher-Order Thunks

A higher-order thunk is a function that returns a thunk.
It may also take another thunk as an input.
It’s like higher-order components in React.

For example, this higher-order thunk generates a thunk that, when run, displays some predefined text.

```js
// test/_/testLog.js
// @flow
import Promise from 'bluebird'

const testLog
  : (text: string) => Thunk
  = text => () => Promise.try(() => {
    console.log(text)
  })

export default testLog
```

```js
// test/hot.js
// @flow
import testLog from './_/testLog'

export default testLog('# Hello world')
```

You see, no more Promises in the test file.


### `thunk`

Consider where a thunk may fail during an asynchronous operation.

```js
// test/_/download.fail.js
// @flow
import * as BadDownloader from './BadDownloader'
const download
  : (url: string) => Thunk
  = url => () => BadDownloader.download(url)
export default download
```

```js
// test/_/BadDownloader.js
// @flow
import Promise from 'bluebird'
export function download (url: string): Promise<Buffer> {
  return Promise.delay(10).then(() => {
    throw new Error('Cannot download file!')
  })
}
```

Let’s try it…

```js
// test/fail-without-thunk.fail.js
// @flow
import download from './_/download.fail'

export default download('http://www.example.com')
```

```
Fatal Error: Cannot download file!
    at BadDownloader.js:4:11
    at tryCatcher (~/bluebird/js/release/util.js:16:23)
    at Promise._settlePromiseFromHandler (~/bluebird/js/release/promise.js:497:31)
    ...
    at [object Object]._onTimeout (~/bluebird/js/release/timers.js:26:46)
    at Timer.listOnTimeout (timers.js:92:15)%
```

You can see that neither the test file (`hot.fail.js`) nor the file that created the thunk are mentioned in the stack trace. This makes debugging very, very hard.

Therefore, I’ll create a function `thunk` that wraps a thunk,
and appends the call site when the promise rejects.

```js
// thunk.js
// @flow
import Promise from 'bluebird'
const thunk
  : (baseThunk: Thunk) => Thunk
  = baseThunk => {
    const created = new Error('From thunk:').stack.replace(/^Error: /, '')
    return () => Promise.try(baseThunk).catch(e => {
      e.stack = (e.stack || 'Error') + '\n' + created
      throw e
    })
  }
export default thunk
```

Now let’s wrap `download` with `thunk`.

```js
// test/_/download-thunked.fail.js
// @flow
import * as BadDownloader from './BadDownloader'
import thunk from '../../thunk'
const download
  : (url: string) => Thunk
  = url => thunk(() => BadDownloader.download(url))
export default download
```

```js
// test/fail-thunk.fail.js
// @flow
import download from './_/download-thunked.fail'

export default download('http://www.example.com')
```

```
Fatal Error: Cannot download file!
    at BadDownloader.js:5:11
    ...
From thunk:
    at thunk (thunk.js:6:21)
    at download (download.fail2.js:6:12)
    at Object.<anonymous> (hot.fail2.js:4:5)
    ...
```

Now that’s better! It shows exactly where the thunk is created.


### `script`

This higher-order thunk takes multiple thunks and returns a thunk which runs each thunk in serial.

```js
// script.js
// @flow
const script
  : (thunks: Array<Thunk>) => Thunk
  = thunks => () => thunks.reduce(
    (promise, thunk) => promise.then(thunk),
    Promise.resolve()
  )
export default script
```

```js
// test/script.js
// @flow
import testLog from './_/testLog'
import script from '../script'
export default script([
  testLog('Hello world'),
  testLog('Testing')
])
```

__This is exactly the reason why I created this test framework.__

Most acceptance test frameworks that use Selenium either

- Requires you to await on Promises. Your test code becomes full of `.then()` or `yield` or `await`. That’s a lot of syntax noise. And if you forgot to `yield` or `await`, your test could break. And you have to wait a long time until you realize you misspelt a method name.
- Somehow manages the asynchronous operations for you using chained method calls. This makes it hard to extend the functionality. For example, if you want custom commands, you need configure your framework to do that.

Compared to `challenge-accepted`, you see that there are no chained method calls. No `yield`, `.then()`, or `await`. This thing is asynchronous-by-default, which is ideal for doing acceptance tests.


### Testing with tap

[TAP](https://testanything.org/) (Test Anything Protocol) provides a standard protocol for testing.
This framework uses [node-tap](http://www.node-tap.org/).

```js
// withTest.js
// @flow
import tap from 'tap'
import Promise from 'bluebird'
import thunk from './thunk'

declare class TestAPI {
  pass (message: string): Thunk;
  fail (message: string, extra: any): Thunk;
  comment (message: string): Thunk;
  case (testName: string): (baseThunk: Thunk) => Thunk;
}

export type WithTest<T> = (f: (api: TestAPI) => T) => T

const withTestFactory
  : (rootTest: TapTest) => WithTest
  = root => {
    const stack: Array<TapTest> = [ tap ]
    const withLatestTest = f => f(stack[stack.length - 1])
    const api: TestAPI = {
      pass: message => thunk(() => withLatestTest(test => test.pass(message))),
      fail: (message, extra) => thunk(() => withLatestTest(test => test.pass(message, extra))),
      comment: message => thunk(() => withLatestTest(test => test.pass(message))),
      case: testName => baseThunk => thunk(() => withLatestTest(test =>
        test.test(testName, child => {
          stack.push(child)
          return Promise.try(baseThunk).finally(() => stack.pop())
        })
      ))
    }
    return f => f(api)
  }
export default withTestFactory(tap)
```

### Logging

For an acceptance test, each step many take some amount of time.
Therefore, logging is implemented as a TAP test case.
Wrap a Thunk with `withLog` to have it printed.

```js
// test/withLog.js
import testDelay from './_/testDelay'
import script from '../script'
import withLog from '../withLog'
export default script([
  testDelay(10),
  testDelay(20),
  testDelay(30),
  testDelay(40),
  withLog('they can be nested!')(script([
    testDelay(10),
    testDelay(20),
    testDelay(30),
    testDelay(40),
  ])),
])
```

```js
// test/_/testDelay.js
// @flow
import Promise from 'bluebird'
import withLog from '../../withLog'
import thunk from '../../thunk'
import tap from 'tap'

const testDelay
  : (ms: number) => Thunk
  = ms => withLog('Delaying for no reason...')(thunk(() => Promise.delay(ms)))

export default testDelay
```

```js
// withLog.js
// @flow
import Promise from 'bluebird'
import withTest from './withTest'
import type { WithTest } from './withTest'
import script from './script'
import thunk from './thunk'

export type WithLog = (message: string) => (baseThunk: Thunk) => Thunk

export const withLogFactory
  : (withTest: WithTest) => WithLog
  = withTest => withTest(test => message => baseThunk => thunk(() => {
    const promise = Promise.try(baseThunk)
    return test.case(message)(() => promise)().then(() => promise)
  }))

export default withLogFactory(withTest)
```


## Appendix

### Flow declarations for 3rd party libraries.

```js
// _/interfaces/bluebird.js
// @flow
declare class Promise<T> {
  static resolve<T>(value: MaybePromise<T>): Promise<T>;
  then(handler: () => MaybePromise<T>): Promise<T>;
  static try<T>(fn: () => MaybePromise<T>): Promise<T>;
  catch(handler: (e: Error) => MaybePromise<T>): Promise<T>;
  finally(handler: () => any): Promise<T>;
  static delay(ms: number): Promise;
  done(): void;
}
declare module 'bluebird' {
  declare var exports: typeof Promise
}
type MaybePromise<T> = Promise<T> | T
```

```js
// _/interfaces/ms.js
// @flow
declare module 'ms' {
  declare var exports: (durationMs: number) => string;
}
```

```js
// _/interfaces/tap.js
// @flow
declare class TapTest {
  test(message: string, f: (child: TapTest) => Promise): TapTest;
  pass(message: string): void;
  fail(message: string, extra: any): void;
}
declare module 'tap' {
  declare var exports: TapTest;
}
```

```js
// _/interfaces/chalk.js
// @flow
declare module 'chalk' {
  declare var exports: any; // Sorry :)
}
```

```js
// _/interfaces/bulk-require.js
// @flow
declare module 'bulk-require' {
  declare var exports: any; // Sorry :)
}
```


## Test Harness

```js
// test/index.js
// @flow
'use strict'
import bulk from 'bulk-require'
import script from '../script'
import withTest from '../withTest'
import thunk from '../thunk'
import Promise from 'bluebird'

const modules = bulk(__dirname, '*.js')
const tests = [ ]

const passingTest = baseThunk => baseThunk
const failingTest = baseThunk => thunk(() => Promise.try(baseThunk).then(
  () => { throw new Error('Expected test to fail!') },
  () => { }
))

for (const moduleName of Object.keys(modules)) {
  const moduleExports = modules[moduleName]
  if (moduleExports === module.exports) continue
  const testFunction = moduleExports && (moduleExports.default || moduleExports)
  if (!testFunction) continue
  tests.push(
    withTest(test => test.case(moduleName)(
      (/\.fail$/.test(moduleName) ? failingTest : passingTest)(testFunction)
    ))
  )
}

module.exports = script(tests)
```
