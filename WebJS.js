/*
# Copyright 2018 IBM
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
*/

    var websocket = null;
    var audioContext = window.AudioContext || window.webkitAudioContext;

    var context = new audioContext();

    $(document).ready(function() {
      allofit();
    });

    $(document).unload(function() {
      websocketDisconnect();
    });

    function allofit() {
      javascriptCheck();
      websocketConnect();
      //setupAudioListener();

      audioButtonStuff();
      dataCacheStuff();
      audioCheckStuff();

      enterbutton();
      invokeAjax ("Hello");

      $('#id_stopButton').hide();
    }

    function processOK(response) {
      console.log('AJAX call successful');
    }

    function processNotOK() {
      console.log('Error Invoking AJAX');
    }

    function flushAudioContext() {
      context.close().then(function() {
        context = new audioContext();
      });
    }

    // ******************************************************
    // if javascript is enabled on the browser then can
    // remove the warning message
    // ******************************************************
    function javascriptCheck() {
      $('#no-script').remove();
    }

    // ******************************************************
    // Web Socket stuff
    // ******************************************************
    function websocketConnect() {
      var uri = determineWSUri()
      //console.log("connect", uri);
      websocket = new WebSocket(uri);

      //$('#id_startButton').data("webSocket", ws);
      setupSockectListeners();
    }

    function websocketDisconnect() {
      if (websocket) {
        websocket.disconnect();
      }
    }

    function determineWSUri() {
      var wsUri = "ws:";
      var loc = window.location;
      //console.log(loc);
      if (loc.protocol === "https:") {
        wsUri = "wss:";
      }
      // This needs to point to the web socket in the Node-RED flow
      // ... in this case it's assist
      wsUri += "//" + loc.host + "/assist";

      return wsUri;
    }

    // Audio Playback
    function playAudio(response) {
      console.log('Audio Received');

      var audio = document.getElementById('audiotag');
      var blob = new Blob([response], {
        type: 'audio/webm'
      });
      var objectURL = URL.createObjectURL(blob);

      audio.src = objectURL;

      audio.onload = function(evt) {
        URL.revokeObjectURL(objectURL);
      }

      console.log('Attempting to play audio');

      audio.play()
        .then(() => {}).catch((error) => {
          console.log('unable to play audio');
          console.log(error);
        });
    }

    function setupSockectListeners() {
      websocket.onmessage = function(msg) {
        console.log('data received from websocket', msg);
        if (msg.data) {
          if (msg.data instanceof Blob) {
            console.log('We have received a blob');
            playAudio(msg.data);
          } else {
            console.log(msg.data);
            var data = JSON.parse(msg.data);
            if (data.results && (data.results instanceof Array)) {
              console.log(data.results[0]);
              if (data.results[0].alternatives &&
                (data.results[0].alternatives instanceof Array)) {
                console.log(data.results[0].alternatives[0]);
                if (data.results[0].alternatives[0].transcript) {
                  //$('#transcription').text(data.results[0].alternatives[0].transcript);
                  chat('Bot', data.results[0].alternatives[0].transcript);
                }
              }
            }
          }
        }
      }

      websocket.onopen = function() {
        $('#status-socket').text('connected');
        console.log("connected");
      }

      websocket.onclose = function() {
        $('#status-socket').text('not connected');
        // in case of lost connection tries to reconnect every 2 secs
        setTimeout(websocketConnect, 2000);
      }
    }

    function audioButtonStuff() {
      var stopButton = $('#id_stopButton');
      var recordButton = $('#id_recordButton');

      (function() {
        recordButton.click(
          function() {
            var message = {
              action: 'start',
              'content-type': 'audio/wav',
              'interim_results': true
            };

            websocket.send(JSON.stringify(message));
            recordButton.hide();
            stopButton.show();
            requestAudioRecording();
          });
        stopButton.click(
          function() {
            recordButton.show();
            stopButton.hide();
            processAudioOnlyStream();
            localStream = stopButton.data("mediaStream");
            if (localStream) {
              // localStream.stop() was throwing a deprecated, will be removed in Nov 2015
              // so aded the track.stop(), but that didn't seem to work well with firefox, so
              // for now keeping both in.

              localStream.getTracks().forEach(function(track) {
                track.stop();
              });

            }
            flushAudioContext();
          });
      })();
    }

    function resetAudioButtons() {
      $('#id_stopButton').hide();
      $('#id_recordButton').hide();
    }

    // ******************************************************
    // This flushes the channel buffers, which are held as data
    // in a datastore field on the page.
    // ******************************************************

    function dataCacheStuff() {
      console.log('Flushing the Channels');
      //$('#id_datastore').removeData();

      var leftchannel = new Array();
      var rightchannel = new Array();
      leftchannel.length = 0;
      rightchannel.length = 0;

      $('#id_datastore').data("leftchannel", leftchannel);
      $('#id_datastore').data("rightchannel", rightchannel);
      $('#id_datastore').data("recording", false);
      $('#id_datastore').data("recordlength", 0);
    }

    // ******************************************************
    // Audio support checks
    // ******************************************************

    function audioCheckStuff() {
      var supported = false;
      if (isUserMediaSupported()) {
        supported = true;
        $('#audio-notsuppported').hide();
      }
      $('#id_datastore').data("audiosupported", supported);
    }

    function isUserMediaSupported() {
      return !!(navigator.getUserMedia || navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia || navigator.msGetUserMedia);
    }

    function getUserMediaFunction() {
      return (navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia);
    }

    // **********************************************
    // The record button has been pressed, so first there
    // is a user prompt to allow recording to happen
    // **********************************************

    function requestAudioRecording() {
      navigator.getUserMedia = getUserMediaFunction();
      navigator.getUserMedia({
          audio: true
        },
        startAudioRecording,
        notAllowed
      );
    }

    function notAllowed(e) {
      var etxt = "Media Persmission Denied - " + e.name;

      setStatusMessage('e', etxt);
      resetAudioButtons();
    }

    // **********************************************
    // Recording is being permitted.
    // **********************************************

    function startAudioRecording(localMediaStream) {
      console.log('Start Audio Recording');
      dataCacheStuff();

      $('#id_stopButton').data("mediaStream", localMediaStream);
      //audioContext = window.AudioContext || window.webkitAudioContext;

      //context = new audioContext();
      // retrieve the current sample rate to be used for WAV packaging
      sampleRate = context.sampleRate;
      //console.log("Sample Rate is ", sampleRate);

      // creates a gain node
      volume = context.createGain();

      // creates an audio node from the microphone incoming stream
      audioInput = context.createMediaStreamSource(localMediaStream);

      // connect the stream to the gain node
      audioInput.connect(volume);

      /* 	From the spec: This value controls how frequently the audioprocess event is
      	dispatched and how many sample-frames need to be processed each call.
      	Lower values for buffer size will result in a lower (better) latency.
      	Higher values will be necessary to avoid audio breakup and glitches */
      var bufferSize = 2048;
      //Stick to 2 input and 2 output channel
      var recorder;
      if (!context.createScriptProcessor) {
        recorder = context.createJavaScriptNode(bufferSize, 2, 2);
      } else {
        recorder = context.createScriptProcessor(bufferSize, 2, 2);
      }
      if (recorder) {
        recorder.onaudioprocess = function(e) {
          var recording = $('#id_datastore').data("recording");
          if (recording) {
            console.log('recording');
            var left = e.inputBuffer.getChannelData(0);
            var right = e.inputBuffer.getChannelData(1);
            //we clone the samples
            var leftchannel = $('#id_datastore').data("leftchannel");
            var rightchannel = $('#id_datastore').data("rightchannel");
            if (leftchannel && rightchannel) {
              leftchannel.push(new Float32Array(left));
              rightchannel.push(new Float32Array(right));
              recordingLength = bufferSize + $('#id_datastore').data("recordlength");
              $('#id_datastore').data("recordlength", recordingLength)
              //console.log('RecordingLenth incremented to ', recordingLength);
            }
          }
        };
        // we connect the recorder
        volume.connect(recorder);
        recorder.connect(context.destination);
        console.log('setting recording to on');
        $('#id_datastore').data("recording", true);
      }
    }

    // **********************************************
    // Stop Recording button has been pressed. No Cancels allowed
    // **********************************************

    function processAudioOnlyStream() {
      if ($('#id_datastore').data("recording")) {
        $('#id_datastore').data("recording", false);

        var leftchannel = $('#id_datastore').data("leftchannel");
        var rightchannel = $('#id_datastore').data("rightchannel");
        var recordingLength = $('#id_datastore').data("recordlength");

        console.log('recordingLength ', recordingLength);

        var leftBuffer = createAudioBuffer(leftchannel, recordingLength);
        var rightBuffer = createAudioBuffer(rightchannel, recordingLength);

        var interleaved = interleave(leftBuffer, rightBuffer);

        // we create our wav file
        var buffer = new ArrayBuffer(44 + interleaved.length * 2);
        var view = new DataView(buffer);

        // RIFF chunk descriptor
        writeUTFBytes(view, 0, 'RIFF');
        view.setUint32(4, 44 + interleaved.length * 2, true);
        writeUTFBytes(view, 8, 'WAVE');
        // FMT sub-chunk
        writeUTFBytes(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        // stereo (2 channels)
        view.setUint16(22, 2, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 4, true);
        view.setUint16(32, 4, true);
        view.setUint16(34, 16, true);
        // data sub-chunk
        writeUTFBytes(view, 36, 'data');
        view.setUint32(40, interleaved.length * 2, true);

        // write the PCM samples
        var lng = interleaved.length;
        var index = 44;
        var volume = 1;
        for (var i = 0; i < lng; i++) {
          view.setInt16(index, interleaved[i] * (0x7FFF * volume), true);
          index += 2;
        }

        // our final binary blob
        var blob = new Blob([view], {
          type: 'audio/wav'
        });

        sendToServer(blob);
        // As a sanity check put this back in to check what is being created.
        //saveAudioFile(blob);
      }
    }

    function createAudioBuffer(channelBuffer, recordingLength) {
      var result = new Float32Array(recordingLength);
      var offset = 0;
      var lng = channelBuffer.length;
      for (var i = 0; i < lng; i++) {
        var buffer = channelBuffer[i];
        result.set(buffer, offset);
        offset += buffer.length;
      }
      return result;
    }

    function interleave(leftChannel, rightChannel) {
      var length = leftChannel.length + rightChannel.length;
      var result = new Float32Array(length);

      var inputIndex = 0;

      for (var index = 0; index < length;) {
        result[index++] = leftChannel[inputIndex];
        result[index++] = rightChannel[inputIndex];
        inputIndex++;
      }
      return result;
    }

    function writeUTFBytes(view, offset, string) {
      var lng = string.length;
      for (var i = 0; i < lng; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    // ********************************************
    // Will be sending the audio to be processed.
    // Send to a holding function on the parent page which should know how to handle
    // ********************************************

    function sendToServer(audioBlob) {
      //handleAudioAsInput(audioBlob);
      console.log('sending blob through web socket');
      console.log(audioBlob);
      websocket.send(audioBlob);

      setTimeout(() => {
        console.log('sending stop through web socket');
        var message = {
          action: 'stop'
        };
        websocket.send(JSON.stringify(message));
      }, 1000);
    }

    function saveAudioFile(blob) {
      //console.log('Saving the blob');
      //console.log(blob);
      var url = URL.createObjectURL(blob);
      //console.log(url);
      //var link = window.document.createElement('a');
      //link.href = url;
      //link.download = 'output.wav';
      var link = '<a href=' + url + '>blob is here </a>'
      //var click = document.createEvent("Event");
      //click.initEvent("click", true, true);
      //link.dispatchEvent(click);
      $('#audio-notsuppported').append(link);
      //console.log('blob should have been saved');
    }

// Conversation Code Starts here
  
  // creates div for interaction with bot      
  function createNewDiv(who, message) {
      var txt = who + ' : ' + message;
      return $('<div></div>').text(txt);
  }
  
  // appends latest communication with bot to botchathistory
  function chat(person, txt) {
      $('#id_botchathistory').append(createNewDiv(person, txt));
  }    
  
  // sets pressing of enter key to perform same action as send button
  function enterbutton(){
      $(function() {
          $("form input").keypress(function (e) {
          if ((e.which && e.which == 13) || (e.keyCode && e.keyCode == 13)) {
               $('#id_enter').click();
               return false;
          } else {
          return true;
          }
       });
      });
  }
  
  // User has entered some text.
  function onChatClick() {
      var txt = $('#id_chattext').val();
      chat('You', txt);
      invokeAjax(txt);
      $('#id_chattext').val('');
  }
  
  function processOK(response) {
      console.log(response);
      console.log(response.botresponse.messageout);
      console.log(response.botresponse.messageout.output.text);
      console.log(response.botresponse.messageout.context);
      chat('Bot', response.botresponse.messageout.output.text);
      $('#id_contextdump').data('convContext', response.botresponse.messageout.context);
  }
  
  function processNotOK() {
      chat('Error', 'Error whilst attempting to talk to Bot');
  }
  
  function invokeAjax(message) {
      var contextdata = $('#id_contextdump').data('convContext');
      console.log('checking stashed context data');
      console.log(contextdata);
  
      var ajaxData = {};
      ajaxData.msgdata = message;
  
      $.ajax({
          type: 'POST',
          url: 'assistant',
          data: ajaxData,
          success: processOK,
          error: processNotOK
      });
  }