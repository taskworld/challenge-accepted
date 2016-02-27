'use strict'

const nyc = require('nyc')
const pick = require('lodash').pick
const omit = require('lodash').omit
const keyBy = require('lodash').keyBy
const updeep = require('updeep')
const u = updeep.default || updeep
const fs = require('fs')

const combineFactory = (data) => {
  const prefixes = createPrefixMap(data)
  return (key, fixer) => {
    fixer = fixer || (x => x)
    const out = { }
    for (const fileName of Object.keys(data)) {
      const prefix = prefixes[fileName]
      const fileData = data[fileName][key]
      for (const id of Object.keys(fileData)) {
        out[`${prefix}.${id}`] = fixer(fileData[id], fileName)
      }
    }
    return out
  }
}

const createPrefixMap = data => {
  const out = { }
  Object.keys(data).forEach((name, index) => out[name] = index)
  return out
}

const combineCoverageDataForGeneratedFiles = (data, resultPath, mappingData) => {
  const combine = combineFactory(data)
  const indexedMappingData = keyBy(mappingData, file => file.path)
  const shiftFactory = filePath => {
    const add = indexedMappingData[filePath].sourceLine
    return x => (x + add - 1)
  }
  const log = (x, fileName) => (console.log(x, fileName), x)
  const withAdder = f => (data, fileName) => u(f(shiftFactory(fileName)))(data)
  const addLoc = add => ({
    start: { line: add },
    end: { line: add }
  })
  return {
    [resultPath]: {
      path: resultPath,
      s: combine('s'),
      b: combine('b'),
      f: combine('f'),
      statementMap: combine('statementMap', withAdder(addLoc)),
      fnMap: combine('fnMap', withAdder(add => ({
        line: add,
        loc: addLoc(add)
      }))),
      branchMap: combine('branchMap', withAdder(add => ({
        line: add,
        locations: u.map(addLoc(add))
      }))),
    }
  }
}

const getMappingData = () => {
  const mappingData = require('./mapping.json')
  return mappingData.map(file => Object.assign({ }, file, {
    path: fs.realpathSync(file.name)
  }))
}

// Weird hack to rewrite coverage data back to README.md!
//
nyc.prototype.writeCoverageFile = (original => function () {
  if (global['__coverage__']) {
    const data = global['__coverage__']
    const mappingData = getMappingData()
    const generatedFilePaths = mappingData.map(file => file.path)
    const coverageDataForGeneratedFiles = pick(data, generatedFilePaths)
    const coverageDataForNonGeneratedFiles = omit(data, generatedFilePaths)
    global['__coverage__'] = Object.assign(
      coverageDataForNonGeneratedFiles,
      combineCoverageDataForGeneratedFiles(
        coverageDataForGeneratedFiles,
        fs.realpathSync('README.md'),
        mappingData
      )
    )
  }
  return original.apply(this, arguments)
})(nyc.prototype.writeCoverageFile)
