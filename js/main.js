
'use strict'; //avoid common coding gotchas

// different browser ways of calling the getUserMedia() API method:
// Opera --> getUserMedia
// Chrome --> webkitGetUserMedia
// Firefox --> mozGetUserMedia
navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

// clean-up function:
window.onbeforeunload = function(e){
        hangup();
};

// Data channel info
var sendChannel, receiveChannel;
//var sendButton = document.getElementById('sendButton');
//var sendTextarea = document.getElementById('dataChannelSend');
//var receiveTextarea = document.getElementById('dataChannelReceive');

var btnVideoStart = document.getElementById('startButton');
var btnVideoJoin = document.getElementById('joinButton');
var roomName = document.getElementById('room-name');

// HTML5 <video> elements
var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');
//var localVideo = document.getElementById('localVideo');
//var remoteVideo = document.getElementById('remoteVideo');

//sendButton.onclick = sendData();

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;

// Streams
var localStream;
var remoteStream;

// Peer Connection
var pc;

var pc_config = {'iceServers':
            [{'url':'stun:stun.services.mozilla.com'}, 
             {'url': 'stun:stun.l.google.com:19302'}]
  };

var pc_constraints = {
  'optional': [
    {'DtlsSrtpKeyAgreement': true}
  ]};

var sdpConstraints = {
    'mandatory': {
    'OfferToReceiveAudio': true,
    'OfferToReceiveVideo': true
    }
  };

// connect to signalling server
var socket = io.connect("http://localhost:8282");


// promp room name
//var room = prompt('Enter room name:');

// Send 'Create or join' message to singnalling server
/*if (room !== '') {
  console.log('Create or join room', room);
  socket.emit('create or join', room);
}
*/

btnVideoStart.onclick = function(e) {
    e.preventDefault();
    // is starting the call
    isInitiator = true;
    initConnection();
};

btnVideoJoin.onclick = function(e) {
    e.preventDefault();
    isInitiator = false;
    // just joining a call, not offering
    initConnection();
};

function initConnection(){
    var room = roomName.value;
    if (room !== '') {
        console.log('Create or join room', room);
        socket.emit('create or join', room);
    }
        
}

// getUserMedia constraints
var constraints = {video: true, audio: true};


// getUserMedia() handlers...
function handleUserMedia(stream) {
    console.log('Adding local stream.');
    localVideo.src = window.URL.createObjectURL(stream);
    localStream = stream;
    sendMessage('got user media');
    if(isInitiator){
        checkAndStart();
    }
  }

function handleUserMediaError(error){
        console.log('navigator.getUserMedia error: ', error);
}
  
// 1. Server-->Client....

// 'created' or 'empty' message coming back from server:
// this peer is the initiator

socket.on('empty', function (room){
  console.log('Created room ' + room);
  //console.log('Clients in room ' + room + 'are  ' + numClients);
  isInitiator = true;

  // getUserMedia()
  navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);
  console.log('Getting user media with constraints', constraints);
 // checkAndStart();
});

// 'full' message coming back from server:
// this peer is blocked
socket.on('full', function (room){
  console.log('Room ' + room + ' is full');
});

// 'join' message coming back from server:
// another peer is joining the channel
socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
  
});

// handle 'joined' message coming back from server:
// this is the second peer joining the channel
socket.on('joined', function (room, numClients){
  console.log('New user has joined room ' + room);
  console.log('Room has ' + numClients + ' clients');
  isChannelReady = true; 
});

// server-sent log message...
socket.on('log', function (array){
  console.log.apply(console, array);
});

// receive message from the other peer via the signalling server
socket.on('message', function (message){
  console.log('Client received message:', message);
  if (message === 'got user media') {
      checkAndStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      checkAndStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({sdpMLineIndex:message.label,
      candidate:message.candidate});
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

// 2. Client-->Server
// send message to the other peer via the signalling server
function sendMessage(message){
  console.log('Sending message: ', message);
  socket.emit('message', message);
}

// channel negotiation trigger function
function checkAndStart() {

  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
        console.log('creating peer connection....')
        createPeerConnection();
        isStarted = true;
    if (isInitiator) {
      doCall();
    }
  }
}

// peer connection management...
function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(pc_config, pc_constraints);

    pc.addStream(localStream);

    pc.onicecandidate = handleIceCandidate;
    console.log('Created RTCPeerConnnection with:\n' +
      '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
      '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
      return;
  }

  pc.onaddstream = handleRemoteStreamAdded;
  pc.onremovestream = handleRemoteStreamRemoved;

  if (isInitiator) {
    try {
      sendChannel = pc.createDataChannel("sendDataChannel",
        {reliable: true});
      console.log('Created send data channel');
    } catch (e) {
      alert('Failed to create data channel. ');
      trace('createDataChannel() failed with exception: ' + e.message);
    }
    sendChannel.onopen = handleSendChannelStateChange;
    sendChannel.onmessage = handleMessage;
    sendChannel.onclose = handleSendChannelStateChange;
  } else { // Joiner
    pc.ondatachannel = gotReceiveChannel;
  }
}

// data channel management
function sendData() {
  var data = sendTextarea.value;
  if(isInitiator) sendChannel.send(data);
  else receiveChannel.send(data);
  console.log('Sent data: ' + data);
}


// handlers...
function gotReceiveChannel(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = handleMessage;
  receiveChannel.onopen = handleReceiveChannelStateChange;
  receiveChannel.onclose = handleReceiveChannelStateChange;
}

function handleMessage(event) {
  console.log('Received message: ' + event.data);
  receiveTextarea.value += event.data + '\n';
}

function handleSendChannelStateChange() {
  var readyState = sendChannel.readyState;
  console.log('Send channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
    sendTextarea.disabled = false;
    sendTextarea.focus();
    sendTextarea.placeholder = "";
    sendButton.disabled = false;
  } else {
    sendTextarea.disabled = true;
    sendButton.disabled = true;
  }
}

function handleReceiveChannelStateChange() {
  var readyState = receiveChannel.readyState;
  console.log('Receive channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
            sendTextarea.disabled = false;
            sendTextarea.focus();
            sendTextarea.placeholder = "";
            sendButton.disabled = false;
          } else {
            sendTextarea.disabled = true;
            sendButton.disabled = true;
          }
}

// ICE candidates management...
function handleIceCandidate(event) {
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate});
  } else {
    console.log('End of candidates.');
  }
}

// create offer
function doCall() {
  console.log('Creating Offer...');
  pc.createOffer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
}

// signalling error handler
function onSignalingError(error) {
        console.log('Failed to create signaling message : ' + error.name);
}

// create answer
function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
}

// success handler for both createOffer() and createAnswer()
function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  sendMessage(sessionDescription);
}

// remote stream handlers...
function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  attachMediaStream(remoteVideo, event.stream);
  console.log('Remote stream attached!!.');
  remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

// clean-up functions...
function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  if (sendChannel) sendChannel.close();
  if (receiveChannel) receiveChannel.close();
  if (pc) pc.close();
  pc = null;
  sendButton.disabled=true;
}

