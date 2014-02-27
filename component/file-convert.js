'use strict'

var tempLib = require('temp')
var error = require('quiver-error').error
var childProcess = require('child_process')
var fileStreamLib = require('quiver-file-stream')

var defaultTempPathBuilder = function(callback) {
  callback(null, tempLib.path())
}

var fileConvertCommandHandlerBuilder = function(config, callback) {
  var commandArgsExtractor = config.commandArgsExtractor

  var stdioLogger = config.stdioLogger
  var commandTimeout = config.commandTimeout

  var inputTempPathBuilder = config.inputTempPathBuilder || defaultTempPathBuilder
  var outputTempPathBuilder = config.outputTempPathBuilder || defaultTempPathBuilder

  var resultContentType = config.resultContentType || 'application/octet-stream'

  var getFilePaths = function(inputStreamable, callback) {
    fileStreamLib.streamableToFile(inputStreamable, inputTempPathBuilder,
      function(err, inputFilePath) {
        if(err) return callback(err)
        
        outputTempPathBuilder(function(err, outputFilePath) {
          if(err) return callback(err)
          
          callback(null, inputFilePath, outputFilePath)
        })
      })
  }

  var logProcessIO = function(command, commandArgs) {
    var logger = stdioLogger.newLog(commandArgs)

    command.stdout.on('data', function (data) {
      logger.stdout(data)
    })

    command.stderr.on('data', function (data) {
      logger.stderr(data)
    })
    
    command.on('exit', function(code) {
      logger.exit(code)
    })
  }

  var runCommand = function(commandArgs, callback) {
    var commandName = commandArgs[0]
    var args = commandArgs.slice(1)

    var command = childProcess.spawn(commandName, args)

    if(stdioLogger) logProcessIO(command, commandArgs)

    // make sure the stdio streams are resumed/closed
    // so that the child process do not hang waiting 
    // from these streams.
    command.stdin.end()
    command.stdout.resume()
    command.stderr.resume()

    var processExited = false

    command.on('exit', function(code) {
      if(processExited) return

      processExited = true
      if(code != 0) return callback(error(500, 
        'child process exited with error code ' + code))
      
      callback(null)
    })

    setTimeout(function() {
      if(processExited) return

      processExited = true
      command.kill()

      callback(error(500, 'child process timeout'))
      
    }, commandTimeout)
  }

  var handler = function(args, inputStreamable, callback) {
    getFilePaths(inputStreamable, function(err, inputFilePath, outputFilePath) {
      if(err) return callback(err)
      
      commandArgsExtractor(args, inputFilePath, outputFilePath, function(err, commandArgs) {
        if(err) return callback(err)
        
        spawnProcess(commandArgs, function(err) {
          if(err) return callback(err)
          
          createFileStreamable(outputFilePath, function(err, resultStreamable) {
            if(err) return callback(err)
            
            resultStreamable.contentType = resultContentType
            callback(null, resultStreamable)
          })
        })
      })
    })
  }

  callback(null, handler)
}

var quiverComponents = [
  {
    name: 'quiver file convert command component',
    type: 'stream handler',
    configParam: [
      {
        key: 'commandArgsExtractor',
        valueType: 'function',
        required: true
      },
      {
        key: 'inputTempPathBuilder',
        valueType: 'function'
      },
      {
        key: 'outputTempPathBuilder',
        valueType: 'function'
      },
      {
        key: 'stdioLogger',
        valueType: 'object'
      },
      {
        key: 'commandTimeout',
        valueType: 'number'
      },
      {
        key: 'resultContentType',
        valueType: 'string'
      },
    ],
    handlerBuilder: fileConvertCommandHandlerBuilder
  }
]

module.exports = {
  quiverComponents: quiverComponents
}