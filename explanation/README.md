Meu objetivo com esse documento é mostrar os principais pontos para que funcione o streaming utilizando **MP4**, **Websockets** e **FFmpeg**.

A documentação completa do **Media Source Extensions** está em [W3C](https://www.w3.org/TR/media-source/).

A documentação completa da **ISO BMFF Byte Stream Format** também está em [W3C](https://w3c.github.io/media-source/isobmff-byte-stream-format.html).

## Ferramentas utilizadas

[Google Chrome](https://www.google.com/chrome/)

Visualização do streaming.

[FFmpeg](https://ffmpeg.org/)

Captura de tela e streaming do conteúdo para o servidor TCP.

[Mp4info](https://www.bento4.com/)

Utilizada para verificar qual é o codec de vídeo e do audio, informação importante para o Media Source Extensions.

[Mp4dump](https://www.bento4.com/)

Utilizada para verificar os segmentos do MP4, o browser precisa de uma ordem específica de segmentos, de acordo com a espeficicação [BMFF](https://w3c.github.io/media-source/isobmff-byte-stream-format.html).

[Node.js](https://nodejs.org)

Utilizada como servidor de injest TCP e servidor de broadcast para os clientes como Websockets.


## Media Source Extensions

Media Source Extensions faz quase todo o trabalho sujo para nós no Browser, a unica coisa que precisamos fazer,
é enviar para ele os segmentos do MP4, binário, e dizer qual é o tipo de dado que estamos enviando.

Basta dizermos para a API o Mime Type do arquivo, no nosso caso foi utilizado:

```javascript
buffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.640028, mp4a.40.2"');
```

### Codecs

Ok, mas de onde vem os **codecs** `avc1.640028` e `mp4a.40.2`?

Para buscar essa informação, utilizei o **Mp4info**, com o comando:

`mp4info video.mp4 | grep Codecs`

Como retorno, obtive:

```
Codecs String: avc1.640028
Codecs String: mp4a.40.2
```

### SourceBuffer

SourceBuffer é a API do MSE utilizada para adicionar os segmentos do vídeo, o detalhe aqui,
é que o buffer do MSE precisa de um tempo para processar o segmento, ou seja, não podemos
enviar novos segmentos do MP4 enquanto o anterior ainda está sendo processado.

SourceBuffer possui uma propriedade que indica se ele ainda está processando: `updating`.
Existe também o evento `updateend` que é chamado quando o updating é completado.

```javascript
var buffer_size = 5*1024*1024;
var buffer_index = 0;
var frag_mp4_buffer = new Uint8Array(buffer_size);
```

Pré alocamos ``5*1024*1024`` bytes que serão utilizados como buffer, serão utilizados enquanto o SourceBuffer ainda está em **updating**.

A variável de controle **buffer_index** é utilizada para sabermos o offset do **frag_mp4_buffer**, para adicionar novos segmentos.

```javascript
var data = new Uint8Array(e.data);

// Se o segmento recebido é válido
if (data.length) {
    // Se o segmento recebido mais o que já esta no buffer
    // extrapola o tamanho do buffer, então ignoramos esse segmento.
    if((buffer_index + data.length) <= buffer_size){
        // Adiciona o segmento recebido ao buffer
        frag_mp4_buffer.set(data, buffer_index);
        buffer_index = buffer_index + data.length;

        // Verificar se o SourceBuffer ainda está processando os segmentos anteriores,
        // não podemos enviar novos segmentos enquanto isso.
        if (!buffer.updating) {
            var appended = frag_mp4_buffer.slice(0, buffer_index);
            buffer.appendBuffer(appended);
            frag_mp4_buffer.fill(0);
            buffer_index = 0;
        }
    }
}
```

## FFmpeg

O stream precisa ser enviado no formato MP4 ``-f mp4``. Só fazer isso não vai funcionar, é preciso segmentar o MP4,
nesse caso utilizamos ``-f mp4 -movflags frag_keyframe+default_base_moof -reset_timestamps 1 -frag_duration 700000``.

Documentação dessas flags podem ser lidas em https://www.ffmpeg.org/ffmpeg-formats.html#Options-8

### movflags

A saída do MP4 para ``tcp://localhost:8081`` precisa ser fragmentada, e os primeiros dois segmentos precisam ser **ftyp** e **moov**
que contêm informações para o funcionamento do MP4, o restante de segmentos são apenas **moof** e **mdat**. As flags utilizadas servem para isso.

Esses segmentos do MP4 podem ser verificados utilizando a ferramenta **mp4dump**, o cabeçalho do MP4 precisa ser mais ou menos assim:

```
[ftyp] size=8+16
  major_brand = iso5
  minor_version = 200
  compatible_brand = iso6
  compatible_brand = mp41
[moov] size=8+1333
  [mvhd] size=12+96
    timescale = 1000
    duration = 100
    duration(ms) = 100
  [trak] size=8+580
  ...
```


### frag_duration

Utilizada para definir o tamanho do segmento em microsegundos. Quanto maior, maior a latência.

### reset_timestamps

Como não utilizamos um MP4 sequenciado, não precisamos dos timestamps corretos.

### Comando de exemplo

```
ffmpeg -f avfoundation -i "2:1"  \
-c:a aac -ab 64k -c:v libx264 -vb 448k -vsync 2 -pix_fmt yuv420p -profile:v high \
-f mp4 -movflags frag_keyframe+default_base_moof -reset_timestamps 1 -frag_duration 70000 \
tcp://localhost:8081/
```

## Node.js

Recebe os pacotes do FFmpeg através do TCP (atualmente é preciso saber quando a conexão é fechada, para não enviar o cabeçalho do MP4),
e os enviamos para o browser através de Websocket.

O detalhe no Node.js é descobrir o cabeçalho do MP4 e o enviar para todas as novas conexão de Websocket, antes de outros pacotes da stream.
O MSE precisa ter o **ftyp** e **moov** antes de receber **moof** e **mdat**.

O código que faz isso no Node.js é o seguinte:

```javascript
const STREAM_PORT = 8081;
const MP4_FTYP = 1718909296;
const MP4_MOOV = 1836019574;

var net = require('net');
var ftyp;
var moov;

net.createServer(function (socket) {
	socket.on('data', function (data) {
		if (!moov) {
			var dataView = new DataView(data);

			var len = dataView.getUint32(0);
			var type = dataView.getInt32(4);

			if (type === MP4_FTYP) {
			    ftyp = new Uint8Array(dataView.buffer.slice(offset, len));
			} else if (type === MP4_MOOV) {
			    moov = new Uint8Array(dataView.buffer.slice(offset, len));
			}
		}

		websocket.broadcast(data);
	}

	socket.on('close', function(code, message){
	    ftyp = undefined;
	    moov = undefined;
	});
}).listen(STREAM_PORT);
```

Sabendo que o dataView é o fragmento recebido do FFmpeg, verificamos que tipo de fragmento estamos recebendo,
e se for ``ftyp`` ou ``moov``, salvamos no servidor, para que toda nova conexão no Websocket receba.

```javascript
socketServer.on('connection', function(socket) {
    if (ftyp && moov) {
        var ftyp_moov = new Uint8Array(ftyp.length + moov.length);
        ftyp_moov.set(ftyp, 0);
        ftyp_moov.set(moov, ftyp.length);

        socket.send(ftyp_moov);
    }
}
```

