# poc-mp4-websocket

Proof of concept to demonstrate streaming with websockets.

## Install

`mkdir poc-mp4-websocket && git clone git@github.com:eventials/poc-mp4-websocket.git ~/poc-mp4-websocket`

`cd ~/poc-mp4-websocket`

`npm install big-integer`

`npm install ws`

## Running

### Mac OS

Media Source Extensions needs to run in a http server, just run:

`cd ~/poc-mp4-websocket`

`python3 -m http.server`

#### On a second terminal:

`cd ~/poc-mp4-websocket`

`node ws.js 8081 8082`

#### On a third terminal:

Choose screen and audio input:

`ffmpeg -f avfoundation -list_devices true -i ""`

Streaming screen and audio to node.js server:

`ffmpeg -f avfoundation -i "<video_index>:<audio_index>" -c:a aac -ab 64k -c:v libx264 -vb 448k -vsync 2 -pix_fmt yuv420p -profile:v high -f mp4 -movflags frag_keyframe+default_base_moof -reset_timestamps 1 -frag_duration 70000 tcp://localhost:8081/`

Now, if everything went well, open `http://localhost:8000/mse.html` and move player position to end.
