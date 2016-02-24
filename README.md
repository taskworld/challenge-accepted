
# challenge-accepted

__A composable testing framework__ based on promise thunks, intended for writing acceptance tests.


## A Test

First, let’s define what a test is. It’s something that…

- Has two outcomes: success or failure.
- Takes some time to run.

It is a function that returns a Promise.
If the Promise resolves, then the test passes; if the Promise rejects, then the test fails!
