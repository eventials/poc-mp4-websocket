// Example:
// node websocket-relay 8081 8082
// ffmpeg -i <some input> -f mpegts tcp://localhost:8081/

var STREAM_PORT = process.argv[2] || 8081,
	WEBSOCKET_PORT = process.argv[3] || 8082,
	HOST = '127.0.0.1';

var WebSocket = require('ws');
var net = require('net');
var bigInt = require("big-integer");

// Keep track of the chat clients
var clients = [];
var completed = false;

const MP4_FTYP = 1718909296;
const MP4_MOOV = 1836019574;

var ftyp;
var moov;
var ftyp_moov;

if (process.argv.length < 3) {
	console.log(
		'Usage: \n' +
		'node websocket-relay.js [<stream-port> <websocket-port>]'
	);
	process.exit();
}

function getUint64(data, offset){
    var dat = data.getUTF8String(offset, 8);
    var str = '0x' + binStringToHex2(dat);

    // Using BigInteger
    var n1 = bigInt(str);
    return n1
}

function parseMP4(dataView, offset, size)
{
    while (offset < size)
    {
        var len = dataView.getUint32(offset);
        var type = dataView.getInt32(offset + 4);

        if (len == 1)
        {
            // Extended size
            len = getUint64(dataView, offset + 8);
        }

        if (type === MP4_FTYP) {
            ftyp = new Uint8Array(dataView.buffer.slice(offset, len));
        } else if (type === MP4_MOOV) {
            moov = new Uint8Array(dataView.buffer.slice(offset, len));

            ftyp_moov = new Uint8Array(ftyp.length + moov.length);
            ftyp_moov.set(ftyp, 0);
            ftyp_moov.set(moov, ftyp.length);

            break;
        }

        offset = offset + len;
    }
}

function initFragment(buffer) {
    var dataView = new DataView(buffer);

    parseMP4(dataView, 0, buffer.byteLength);
}

// Websocket Server
var socketServer = new WebSocket.Server({port: WEBSOCKET_PORT, perMessageDeflate: false});
socketServer.connectionCount = 0;
socketServer.on('connection', function(socket) {
	socketServer.connectionCount++;
	console.log(
		'New WebSocket Connection: ', 
		socket.upgradeReq.socket.remoteAddress,
		socket.upgradeReq.headers['user-agent'],
		'('+socketServer.connectionCount+' total)'
	);
	socket.on('close', function(code, message){
		socketServer.connectionCount--;
		console.log(
			'Disconnected WebSocket ('+socketServer.connectionCount+' total)'
		);
	});

    if (ftyp_moov) {
        console.log('Send FTYP and MOOV.');

        socket.send(ftyp_moov);
    }
});

socketServer.broadcast = function(data) {
	socketServer.clients.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	});
};

net.createServer(function (socket) {
	// Identify this client
  	socket.name = socket.remoteAddress + ":" + socket.remotePort;

	socket.on('data', function (data) {
        if (!moov) {
            initFragment(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
        }
    	socketServer.broadcast(data);
  	});

    socket.on('close', function(code, message){
        ftyp_moov = undefined;
    });

}).listen(STREAM_PORT);

console.log('Listening for incomming MP4 Stream on tcp://127.0.0.1:'+STREAM_PORT+'/');
console.log('Awaiting WebSocket connections on ws://127.0.0.1:'+WEBSOCKET_PORT+'/');
