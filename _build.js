'use strict'

const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const omit = require('lodash').omit
const tap = x => f => (f(x), x)

tap(
  tap(
    scan(fs.readFileSync('README.md', 'utf8'))
  )(files => files.forEach(write))
)(writeMapping)

function write (file) {
  mkdirp.sync(path.dirname(file.name))
  if (!fs.existsSync(file.name) || fs.readFileSync(file.name, 'utf8') !== file.code) {
    console.log('Writing: ' + file.name)
    fs.writeFileSync(file.name, file.code)
  }
}

function writeMapping (files) {
  fs.writeFileSync('mapping.json', JSON.stringify(files.map(file => omit(file, 'code'))))
}

function scan (data) {
  const out = [ ]
  data.replace(/(```js\s+\/\/[ ]+(\S+).*\n)([\s\S]*?)```/g, (all, prefix, name, code, index) => {
    const sourceLine = data.substr(0, index + prefix.length).split('\n').length
    out.push({ name: 'src/' + name, code, sourceLine })
  })
  return out
}
