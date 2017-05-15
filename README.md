# poc-mp4-websocket

Proof of concept to demonstrate streaming with websockets.

Actually, don't work with firefox and edge, needs more research.

## Install

Clone this repo, then run:

`npm install`

## Running

### Mac OS

Media Source Extensions needs to run in a http server, just run:

`npm run http-server`

#### On a second terminal:

`npm run ws-server`

#### On a third terminal:

Choose screen and audio input:

`ffmpeg -f avfoundation -list_devices true -i ""`

Streaming screen and audio to node.js server:

`ffmpeg -f avfoundation -i "<video_index>:<audio_index>" -c:a aac -ab 64k -c:v libx264 -vb 448k -vsync 2 -pix_fmt yuv420p -profile:v high -f mp4 -movflags frag_keyframe+default_base_moof -reset_timestamps 1 -frag_duration 70000 tcp://localhost:8081/`

Now, if everything went well, open `http://localhost:8000/`.
