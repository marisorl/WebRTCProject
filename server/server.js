/* 
 * server.js
 * node.js
 * socket.io
 * Server script
 */
var os = require('os');
var static = require('node-static');
var http = require('http');
// Create a node-static server instance
var file = new(static.Server)();

var app = http.createServer(function (req, res) {
  file.serve(req, res);
}).listen(8282);

// Use socket.io JavaScript library for real-time web applications
var io = require('socket.io').listen(app);

// connections...
io.sockets.on('connection', function (socket){

/*
// when receive sdp, broadcast sdp to other user
	socket.on('sdp', function(data){
		console.log('Received SDP from ' + socket.id);
		socket.to(data.room).emit('sdp received', data.sdp);
	});

	// when receive ice candidate, broadcast sdp to other user
	socket.on('ice candidate', function(data){
		console.log('Received ICE candidate from ' + socket.id + ' ' + data.candidate);
		socket.to(data.room).emit('ice candidate received', data.candidate);
	});
     
 */
        // Handle 'message' messages
    socket.on('message', function (message) {
        log('Server --> got message: ', message);
        socket.broadcast.emit('message', message);
    });

    // Handle 'create or join' messages
    socket.on('create or join', function (room) {
        //var existingRoom = io.sockets.adapter.rooms[room];
        //var clients = [];
        io.in(room).clients = [];
        
       // if(existingRoom){ clients = Object.keys(existingRoom); }
        log('Server --> Room ' + room + ' has ' + io.in(room).clients.length + ' client(s)');
        log('Server --> Request to create or join room', room);

        // First client joining...
        if (io.in(room).clients.length === 0){
            socket.join(room);
            //io.sockets.to(room).emit('created', room);
            io.to(room).emit('empty', room);
            
        } else if (io.in(room).clients.length === 1) {
        // Second client joining...
            socket.join(room);
            socket.to(room).emit('joined', room, io.in(room).clients.length + 1);
        } else { // max two clients
            socket.emit('full', room);
        }
    });
    
    socket.on('error', function(error){
		console.error(error);
	})

    function log(){
        var array = [">>> "];
        for (var i = 0; i < arguments.length; i++) {
                array.push(arguments[i]);
        }
        socket.emit('log', array);
    }
});