
import { ExtendStreamReader } from "partic2/CodeRunner/jsutils2";
import { future, ArrayWrap2, Ref2, CanceledError, ArrayBufferConcat, throwIfAbortError, assert, BytesToHex } from "partic2/jsutils1/base";
import {getFileSystemReadableStream, SimpleFileSystem} from 'partic2/CodeRunner/JsEnviron'
const decode=TextDecoder.prototype.decode.bind(new TextDecoder());
const encode=TextEncoder.prototype.encode.bind(new TextEncoder());
const mimeDb={
	"js": "application/javascript",
	"json": "application/json",
	"bin": "application/octet-stream",
	"exe": "application/octet-stream",
	"dll": "application/octet-stream",
	"deb": "application/octet-stream",
	"dmg": "application/octet-stream",
	"iso": "application/octet-stream",
	"img": "application/octet-stream",
	"msi": "application/octet-stream",
	"msp": "application/octet-stream",
	"msm": "application/octet-stream",
	"pdf": "application/pdf",
	"m3u8": "application/vnd.apple.mpegurl",
	"wasm": "application/wasm",
	"7z": "application/x-7z-compressed",
	"der": "application/x-x509-ca-cert",
	"pem": "application/x-x509-ca-cert",
	"crt": "application/x-x509-ca-cert",
	"xpi": "application/x-xpinstall",
	"xhtml": "application/xhtml+xml",
	"zip": "application/zip",
	"mid": "audio/midi",
	"midi": "audio/midi",
	"kar": "audio/midi",
	"mp3": "audio/mpeg",
	"ogg": "audio/ogg",
	"m4a": "audio/x-m4a",
	"ra": "audio/x-realaudio",
	"woff": "font/woff",
	"woff2": "font/woff2",
	"avif": "image/avif",
	"gif": "image/gif",
	"jpeg": "image/jpeg",
	"jpg": "image/jpeg",
	"png": "image/png",
	"svg": "image/svg+xml",
	"svgz": "image/svg+xml",
	"tif": "image/tiff",
	"tiff": "image/tiff",
	"webp": "image/webp",
	"ico": "image/x-icon",
	"jng": "image/x-jng",
	"bmp": "image/x-ms-bmp",
	"css": "text/css",
	"html": "text/html",
	"htm": "text/html",
	"shtml": "text/html",
	"mml": "text/mathml",
	"txt": "text/plain",
	"xml": "text/xml",
	"3gpp": "video/3gpp",
	"3gp": "video/3gpp",
	"mp4": "video/mp4",
	"mpeg": "video/mpeg",
	"mpg": "video/mpeg",
	"mov": "video/quicktime",
	"webm": "video/webm",
	"flv": "video/x-flv",
	"m4v": "video/x-m4v",
	"mng": "video/x-mng",
	"asx": "video/x-ms-asf",
	"asf": "video/x-ms-asf",
	"wmv": "video/x-ms-wmv",
	"avi": "video/x-msvideo"
}


//Don't use Response directly, Response limit status range into 200-599
class ProtocolSwitchResponse extends Response{
	closed=new future<0>();
	protected pStatus:number=101;
	get status(){
		return this.pStatus;
	}
	constructor(body?: BodyInit | null, init?: ResponseInit){
		let pStat=init?.status
		if(init?.status!=undefined){
			init.status=200;
		}
		super(body,init);
		if(pStat!=undefined)this.pStatus=pStat;
	}
}

export class WebSocketServerConnection {
	closed = false;
	opcodes = { TEXT: 1, BINARY: 2, PING: 9, PONG: 10, CLOSE: 8 };
	queuedRecvData = new ArrayWrap2<Uint8Array|string>();
	constructor(public reader: ExtendStreamReader, public writer: WritableStreamDefaultWriter<Uint8Array>) {
		this.startProcessWebSocketStream();
	}
	protected pWsHeaderBuf = new Uint8Array(14);
	protected pCurrPacket: null | {
		payloads: Array<Uint8Array>,
		opcode: number
	} = null;
	protected async startProcessWebSocketStream() {
		while(!this.closed){
			let readPos = new Ref2<number>(0);
			while (readPos.get() < 2) {
				await this.reader.readInto(this.pWsHeaderBuf, readPos);
			}
			let view = new DataView(this.pWsHeaderBuf.buffer, 0);
			let idx = 2,
				b1 = view.getUint8(0),
				fin = b1 & 128,
				opcode = b1 & 15,
				b2 = view.getUint8(1),
				hasMask = b2 & 128; //Must true
			if (this.pCurrPacket == null) {
				if (this.pCurrPacket == null) {
					this.pCurrPacket = { payloads: [], opcode }
				}
			}
			let length = b2 & 127;
			if (length > 125) {
				if (length == 126) {
					while (readPos.get() < 4) {
						await this.reader.readInto(this.pWsHeaderBuf, readPos);
					}
					length = view.getUint16(2, false);
					idx += 2;
				} else if (length == 127) {
					while (readPos.get() < 10) {
						await this.reader.readInto(this.pWsHeaderBuf, readPos);
					}
					if (view.getUint32(2, false) != 0) {
						this.close(1009, "");
					}
					length = view.getUint32(6, !1);
					idx += 8;
				}
			}
			while (readPos.get() < idx + 4) {
				await this.reader.readInto(this.pWsHeaderBuf, readPos);
			}
			let maskBytes = this.pWsHeaderBuf.slice(idx, idx + 4);
			idx += 4;
			let payload = new Uint8Array(length);
			if(readPos.get()-idx>0){
				this.reader.unshiftBuffer(new Uint8Array(this.pWsHeaderBuf.buffer,idx,readPos.get()-idx))
			}
			readPos.set(0);
			while (readPos.get() < length) {
				await this.reader.readInto(payload, readPos);
			}
			for (let i = 0; i < payload.length; i++) {
				payload[i] = maskBytes[i % 4] ^ payload[i];
			}
			this.pCurrPacket.payloads.push(payload);
			if (fin) {
				this.handlePacket(this.pCurrPacket);
				this.pCurrPacket = null;
			}
		}
	}
	protected async writeFrame(opcode: number, payload: Uint8Array) {
		await this.writer.ready;
		return await this.writer.write(this.encodeMessage(opcode, payload));
	}
	async send(obj: Uint8Array | string) {
		let opcode: number, payload: Uint8Array;
		if (obj instanceof Uint8Array) {
			opcode = this.opcodes.BINARY;
			payload = obj;
		} else if (typeof obj == "string") {
			opcode = this.opcodes.TEXT;
			payload = encode(obj);
		} else {
			throw new Error("Cannot send object. Must be string or Uint8Array");
		}
		await this.writeFrame(opcode, payload);
	}
	async receive():Promise<Uint8Array|string>{
		try{
			if(this.closed)throw new Error('WebSocket closed');
			return await this.queuedRecvData.queueBlockShift();
		}catch(err){
			if(err instanceof CanceledError && this.closed){
				throw new Error('WebSocket closed');
			}else{
				throw err;
			}
		}
	}
	async close(code?: number, reason?: string) {
		const opcode = this.opcodes.CLOSE;
		let buffer: Uint8Array;
		let reasonU8: Uint8Array | undefined;
		if (reason != undefined) reasonU8 = encode(reason);
		if (code != undefined) {
			buffer = new Uint8Array(reasonU8!.length + 2);
			const view = new DataView(buffer.buffer);
			view.setUint16(0, code, !1);
			buffer.set(reasonU8!, 2);
		} else {
			buffer = new Uint8Array(0);
		}
		await this.writeFrame(opcode, buffer);
		await this.writer.closed;
		this.closed = true;
		this.queuedRecvData.cancelWaiting();
		this.handshakeResponse?.closed.setResult(0);
	}

	protected async handlePacket(packet: {
		payloads: Array<Uint8Array>,
		opcode: number
	}) {
		let concated = packet.payloads.length === 1 ?
			packet.payloads[0]
			: new Uint8Array(ArrayBufferConcat(packet.payloads));

		switch (packet.opcode) {
			case this.opcodes.TEXT:
				this.queuedRecvData.queueSignalPush(decode(concated));
				break;
			case this.opcodes.BINARY:
				this.queuedRecvData.queueBlockPush(concated);
				break;
			case this.opcodes.PING:
				await this.writeFrame(this.opcodes.PONG, concated);
				break;
			case this.opcodes.PONG:
				break;
			case this.opcodes.CLOSE:
				let code: number | undefined;
				let reason: string | undefined;
				if (concated.length >= 2) {
					code = new DataView(concated.buffer, concated.byteOffset).getUint16(0, false);
					reason = decode(concated.slice(2));
				}
				this.close(code, reason);
				break;
			default:
				this.close(1002, "unknown opcode");
		}
	}
	protected encodeMessage(opcode: number, payload: Uint8Array) {
		let buf, b1 = 128 | opcode, b2 = 0, length = payload.length;
		if (length < 126) {
			buf = new Uint8Array(payload.length + 2 + 0);
			const view = new DataView(buf.buffer);
			b2 |= length;
			view.setUint8(0, b1);
			view.setUint8(1, b2);
			buf.set(payload, 2);
		} else if (length < 65536) {
			buf = new Uint8Array(payload.length + 2 + 2);
			const view = new DataView(buf.buffer);
			b2 |= 126;
			view.setUint8(0, b1);
			view.setUint8(1, b2);
			view.setUint16(2, length);
			buf.set(payload, 4);
		} else {
			buf = new Uint8Array(payload.length + 2 + 8);
			const view = new DataView(buf.buffer);
			b2 |= 127;
			view.setUint8(0, b1);
			view.setUint8(1, b2);
			view.setUint32(2, 0, !1);
			view.setUint32(6, length, !1);
			buf.set(payload, 10);
		}
		return buf;
	}
	static KEY_SUFFIX = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
	handshakeResponse?:ProtocolSwitchResponse
	async switchToWebsocket(req: Request) {
		if(this.handshakeResponse!=undefined)return this.handshakeResponse;
		// Use Web Cryptography API crypto.subtle where defined
		let key: string;
		if (globalThis.crypto.subtle) {
			key = globalThis.btoa(
				[
					...new Uint8Array(
						await crypto.subtle.digest(
							"SHA-1",
							encode(
								`${req.headers.get('sec-websocket-key')}${WebSocketServerConnection.KEY_SUFFIX}`,
							),
						),
					),
				].map((s) => String.fromCodePoint(s)).join(""),
			);
		} else {
			const { createHash } = await import("tjs:hashing");
			const hash = createHash("sha1").update(
				`${req.headers.get('sec-websocket-key')}${WebSocketServerConnection.KEY_SUFFIX}`,
			).bytes();
			key = btoa(
				String.fromCodePoint(...hash),
			);
		}
		this.handshakeResponse=new ProtocolSwitchResponse(null,{
			status:101,
			statusText:'Switch Protocol',
			headers:new Headers({
				Upgrade: 'WebSocket',
				Connection: 'Upgrade',
				'sec-websocket-accept': key
			})}
		)
		return this.handshakeResponse;
	}
}


export class HttpServer{
	static requestExp = /^([A-Z-]+) ([^ ]+) HTTP\/([^ \t]+)\r\n$/;
	onfetch:(this:HttpServer,request:Request,connection:{r:ExtendStreamReader,w:WritableStreamDefaultWriter<Uint8Array>})=>Promise<Response>=async ()=>new Response();
	controller=new AbortController();
	signal=this.controller.signal;
	async serve(stream:{r:ExtendStreamReader,w:WritableStreamDefaultWriter<Uint8Array>}){
		while(!this.signal.aborted){
			let req=await this.pParseHttpRequest(stream.r);
			let resp=await this.onfetch(req,{...stream});
			await this.pWriteResponse(stream.w,resp);
			if(resp instanceof ProtocolSwitchResponse){
				try{
					await resp.closed.get();
				}catch(err:any){
					throwIfAbortError(err);
				}
				break;
			}
		}
	}
	protected async pParseHttpHeader(r:ExtendStreamReader){
		const lineSpliter='\n'.charCodeAt(0);
		let reqHdr=decode(await r.readUntil(lineSpliter));
		let matchResult=reqHdr.match(HttpServer.requestExp);
		assert(matchResult!=null);
		let method=matchResult[1];
		let pathname=matchResult[2];
		let httpVersion=matchResult[3];
		let headers=new Headers();
		for(let t1=0;t1<64*1024;t1++){
			let line=decode(await r!.readUntil(lineSpliter));
			if(line=='\r\n')break;
			let sepAt=line.indexOf(':');
			headers.set(line.substring(0,sepAt),line.substring(sepAt+1,line.length-2).trim())
		}
		return {method,pathname,httpVersion,headers}
	}
	protected async pParseHttpRequest(r:ExtendStreamReader){
		let header1=await this.pParseHttpHeader(r);
		let bodySource
		if(header1.headers.get('transfer-encoding')==='chunked'){
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					let length=Number(decode(await r.readUntil('\n'.charCodeAt(0))).trim());
					if(length==0){
						let eoc=new Uint8Array(2);
						await r.readInto(eoc);
						assert(decode(eoc)=='\r\n');
						controller.close();
					}else{
						let buf=new Uint8Array(length);
						let writePos=new Ref2<number>(0);
						while(writePos.get()<length){
							await r.readInto(buf,writePos);
						}
						let eoc=new Uint8Array(2);
						await r.readInto(eoc);
						assert(decode(eoc)=='\r\n');
						controller.enqueue(buf);
					}
				}
			}
		}else if(header1.headers.has('content-length')){
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					let contentLength=Number(header1.headers.get('content-length')!.trim());
					let buf=new Uint8Array(contentLength);
					let writePos=new Ref2<number>(0);
					while(writePos.get()<length){
						await r.readInto(buf,writePos);
					}
					controller.enqueue(buf);
					controller.close();
				}
			}
		}else{
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					controller.close();
				}
			}
		}
		bodySource satisfies UnderlyingDefaultSource<Uint8Array>;
		let url=header1.pathname;
		if(!url.startsWith('http:')){
			url='http://';
			if(header1.headers.has('host')){
				url+=header1.headers.get('host')
			}else{
				url+='0.0.0.0:0';
			}
			url+=header1.pathname;
		}
		let req=new Request(url,{
			method:header1.method,
			body:['GET','HEAD'].includes(header1.method.toUpperCase())?undefined
				:new ReadableStream(bodySource),
			headers:header1.headers
		});
		return req;
	}
	protected async pWriteResponse(w:WritableStreamDefaultWriter<Uint8Array>,resp:Response){
		let headersString=new Array<string>();
		let chunked=resp.headers.get('transfer-encoding')=='chunked'
		resp.headers.forEach((val,key)=>{
			headersString.push(`${key}: ${val}`);
		});
		let nonChunkBody:ArrayBuffer|null=null;
		if(!chunked && !resp.headers.has('content-length')){
			nonChunkBody=await resp.arrayBuffer();
			headersString.push('Content-Length:' +String(nonChunkBody.byteLength));
		}
		await w.write(encode(
			[
				`HTTP/1.1 ${resp.status} ${resp.statusText}`,
				...headersString,
				'\r\n'
			].join('\r\n'))
		);
		if(resp.body!=undefined){
			if(chunked){
				await resp.body.pipeTo(new WritableStream({
					write:async (chunk: Uint8Array, controller: WritableStreamDefaultController)=>{
						await w.write(encode(String(chunk.length)+'\r\n'));
						await w.write(chunk);
					}
				}));
				await w.write(encode('0\r\n\r\n'));
			}else if(nonChunkBody!=null){
				await w.write(new Uint8Array(nonChunkBody!));
			}else{
				await resp.body.pipeTo(new WritableStream({
					write:async (chunk: Uint8Array, controller: WritableStreamDefaultController)=>{
						await w.write(chunk);
					}
				}));
			}
		}
	}
}

export class SimpleFileServer{
    constructor(public fs:SimpleFileSystem){}
    onfetch=async (req:Request):Promise<Response>=>{
        let filepath=new URL(req.url).pathname;
        try{
			assert(await this.fs.filetype(filepath)==='file','Not a valid file');
            let statResult=await this.fs.stat(filepath);
			let headers=new Headers();
			headers.set('content-length',String(statResult.size));
			let fileNameAt=filepath.lastIndexOf('/');
			let fileName=filepath.substring(fileNameAt+1);
			let extStartAt=fileName.lastIndexOf('.');
			let ext='';
			if(extStartAt>=0){
				ext=fileName.substring(extStartAt+1);
			}
			if(ext in mimeDb){
				headers.set('content-type',(mimeDb as any)[ext]);
			}
            let t1=new Response(getFileSystemReadableStream(this.fs,filepath),
				{headers});
			return t1;
        }catch(err:any){
            return new Response(err.toString(),{status:404});
        }
    }
}