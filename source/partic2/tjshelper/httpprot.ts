
import { ExtendStreamReader } from "partic2/CodeRunner/jsutils2";
import { future, ArrayWrap2, Ref2, CanceledError, ArrayBufferConcat, throwIfAbortError, assert, Task, ArrayBufferToBase64, GetCurrentTime } from "partic2/jsutils1/base";
import {simpleFileSystemHelper, SimpleFileSystem} from 'partic2/CodeRunner/JsEnviron'
import { TjsReaderDataSource, TjsWriterDataSink } from "partic2/tjshelper/tjsutil";

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
	protected pStatus:number=101;
	get status(){
		return this.pStatus;
	}
	set status(v:number){}
	constructor(body?: BodyInit | null, init?: ResponseInit){
		let pStat=init?.status
		if(init?.status!=undefined){
			init.status=200;
		}
		super(body,init);
		if(pStat!=undefined)this.pStatus=pStat;
	}
}

interface WebSocketConnection{
	send(obj: Uint8Array | string | Array<Uint8Array>):Promise<void>
	receive():Promise<Uint8Array|string>
	close():void
}
export type WebSocketServerConnection=WebSocketConnection;
export type WebSocketClientConnection=WebSocketConnection;

let WebSocketOpcodeConst={ TEXT: 1, BINARY: 2, PING: 9, PONG: 10, CLOSE: 8 };

class WebSocketStreamHandler{
	constructor(public reader: ExtendStreamReader, public writer: WritableStreamDefaultWriter<Uint8Array>) {
		if(typeof (WebSocket as any).__tjs_ws_fastXor==='function'){
			this._payloadXor=(WebSocket as any).__tjs_ws_fastXor;
		}
		this.startProcessWebSocketStream();
	}
	closed = new future<boolean>();
	protected pCurrPacket: null | {
		payloads: Array<Uint8Array>,
		opcode: number
	} = null;
	error:any=null;
	protected queuedRecvData = new ArrayWrap2<Uint8Array|string>();
	protected _payloadXor=(mask:Uint8Array,payload:Uint8Array)=>{
		for (let i = 0; i < payload.length; i++) {
			payload[i] = mask[i % 4] ^ payload[i];
		}
	}
	protected async readForNBytesView(n:number){
		let buf=await this.reader.readForNBytes(n);
		return new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
	}
	protected async startProcessWebSocketStream() {
		try{
			while(!this.closed.done){
				let view = await this.readForNBytesView(2);
				let idx = 2,
					b1 = view.getUint8(0),
					fin = b1 & 128,
					opcode = b1 & 15,
					b2 = view.getUint8(1),
					hasMask = b2 & 128;
				if (this.pCurrPacket == null) {
					if (this.pCurrPacket == null) {
						this.pCurrPacket = { payloads: [], opcode }
					}
				}
				let length = b2 & 127;
				if (length > 125) {
					if (length == 126) {
						length = (await this.readForNBytesView(2)).getUint16(0, false);
						idx += 2;
					} else if (length == 127) {
						view=(await this.readForNBytesView(8));
						if (view.getUint32(0, false) != 0) {
							this.close(1009, "");
						}
						length = view.getUint32(4, false);
					}
				}
				let maskBytes;
				if(hasMask){
					maskBytes = await this.reader.readForNBytes(4);
				}
				let payload=await this.reader.readForNBytes(length);
				if(hasMask){
					this._payloadXor(maskBytes!,payload)
				}
				this.pCurrPacket.payloads.push(payload);
				if (fin) {
					this.handlePacket(this.pCurrPacket);
					this.pCurrPacket = null;
				}
			}
		}catch(err:any){
			throwIfAbortError(err);
			this.error=err;
		}finally{
			if(!this.closed.done)this.close(1000,'Unexpected error');
		}
	}
	protected async handlePacket(packet: {
		payloads: Array<Uint8Array>,
		opcode: number
	}) {
		let concated = packet.payloads.length === 1 ?
			packet.payloads[0]
			: new Uint8Array(ArrayBufferConcat(packet.payloads));

		switch (packet.opcode) {
			case WebSocketOpcodeConst.TEXT:
				this.queuedRecvData.queueSignalPush(decode(concated));
				break;
			case WebSocketOpcodeConst.BINARY:
				this.queuedRecvData.queueBlockPush(concated);
				break;
			case WebSocketOpcodeConst.PING:
				await this.writeFrame(WebSocketOpcodeConst.PONG, [concated]);
				break;
			case WebSocketOpcodeConst.PONG:
				break;
			case WebSocketOpcodeConst.CLOSE:
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
	protected sendWithMask():boolean{
		return false;
	}
	protected encodeMessage(opcode: number, payload: Array<Uint8Array>) {
		let buf, b1 = 128 | opcode, b2 = this.sendWithMask()?128:0;
		let length = payload.reduce((prev,curr)=>prev+curr.length,0);
		if (length < 126) {
			buf = new Uint8Array(2 + 0);
			const view = new DataView(buf.buffer);
			b2 |= length;
			view.setUint8(0, b1);
			view.setUint8(1, b2);
		} else if (length < 65536) {
			buf = new Uint8Array(2 + 2);
			const view = new DataView(buf.buffer);
			b2 |= 126;
			view.setUint8(0, b1);
			view.setUint8(1, b2);
			view.setUint16(2, length);
		} else {
			buf = new Uint8Array(2 + 8);
			const view = new DataView(buf.buffer);
			b2 |= 127;
			view.setUint8(0, b1);
			view.setUint8(1, b2);
			view.setUint32(2, 0, false);
			view.setUint32(6, length, false);
		}
		let bufs=[buf];
		if(this.sendWithMask()){
			bufs.push(new Uint8Array([0,0,0,0]));
		}
		bufs.push(...payload)
		return new Uint8Array(ArrayBufferConcat(bufs));
	}
	protected async writeFrame(opcode: number, payload: Array<Uint8Array>) {
		await this.writer.ready;
		return await this.writer.write(this.encodeMessage(opcode, payload));
	}
	async send(obj: Uint8Array | string | Array<Uint8Array>) {
		let opcode: number, payload: Array<Uint8Array>;
		if (obj instanceof Uint8Array) {
			opcode = WebSocketOpcodeConst.BINARY;
			payload = [obj];
		} else if (typeof obj == "string") {
			opcode = WebSocketOpcodeConst.TEXT;
			payload = [encode(obj)];
		} else if(obj instanceof Array){
			opcode=WebSocketOpcodeConst.BINARY;
			payload=obj
		}else {
			throw new Error("Cannot send object. Must be string or Uint8Array");
		}
		await this.writeFrame(opcode, payload);
	}
	async receive():Promise<Uint8Array|string>{
		try{
			if(this.closed.done)throw new Error('WebSocket closed');
			let nextPacket=await this.queuedRecvData.queueBlockShift();
			return nextPacket;
		}catch(err){
			if(err instanceof CanceledError && this.closed.done){
				throw new Error('WebSocket closed');
			}else{
				throw err;
			}
		}
	}
	async close(code?: number, reason?: string) {
		if(!this.closed.done){
			this.closed.setResult(true);
			const opcode = WebSocketOpcodeConst.CLOSE;
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
			await this.writeFrame(opcode, [buffer]);
		}
		this.queuedRecvData.cancelWaiting();
	}
	static KEY_SUFFIX = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
	
}

export class WebSocketServerStreamHandler extends WebSocketStreamHandler {
	handshakeResponse?:ProtocolSwitchResponse
	async switchToWebsocketResponse(req: Request) {
		if(this.handshakeResponse!=undefined)return this.handshakeResponse;
		// Use Web Cryptography API crypto.subtle where defined
		let key: string;
		if (globalThis.crypto?.subtle!=undefined) {
			key = globalThis.btoa(
				[
					...new Uint8Array(
						await crypto.subtle.digest(
							"SHA-1",
							encode(
								`${req.headers.get('sec-websocket-key')}${WebSocketStreamHandler.KEY_SUFFIX}`,
							),
						),
					),
				].map((s) => String.fromCodePoint(s)).join(""),
			);
		} else {
			//use partic2/txiki.js sha1
			assert((tjs as any).mbedtls?.sha1!=undefined);
			let t1=new TextEncoder().encode(`${req.headers.get('sec-websocket-key')}${WebSocketStreamHandler.KEY_SUFFIX}`);
			let hash=(tjs as any).mbedtls.sha1(t1) as Uint8Array;
			key = ArrayBufferToBase64(hash)
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


export class WebSocketClientStreamHandler extends WebSocketStreamHandler {
	protected sendWithMask(): boolean {
		return true;
	}
}
let httpRequestExp=/^([A-Z-]+) ([^ ]+) HTTP\/([^ \t]+)\r\n$/;
let httpResponseExp=/^HTTP\/([^ \t]+)\s+([^\s]+)\s+(.*)\r\n$/
const lineSpliter='\n'.charCodeAt(0);

async function parseHttpKevValueHeader(r:ExtendStreamReader){
	let headers=new Headers();
	for(let t1=0;t1<64*1024;t1++){
		let line=decode(await r!.readUntil(lineSpliter));
		if(line=='\r\n')break;
		let sepAt=line.indexOf(':');
		headers.set(line.substring(0,sepAt),line.substring(sepAt+1,line.length-2).trim())
	}
	return headers;
}
async function parseHttpRequestHeader(r:ExtendStreamReader){
	let reqHdr=decode(await r.readUntil(lineSpliter));
	let matchResult=reqHdr.match(httpRequestExp);
	assert(matchResult!=null);
	let method=matchResult[1];
	let pathname=matchResult[2];
	let httpVersion=matchResult[3];
	return {method,pathname,httpVersion,headers:await parseHttpKevValueHeader(r)};
}
async function parseHttpResponseHeader(r:ExtendStreamReader){
	let respHdr=decode(await r.readUntil(lineSpliter));
	let matchResult=respHdr.match(httpResponseExp);
	assert(matchResult!=null);
	let httpVersion=matchResult[1];
	let status=matchResult[2];
	let statusText=matchResult[3];
	return {httpVersion,status,statusText,headers:await parseHttpKevValueHeader(r)};
	
}

export class HttpServer{
	onfetch:(request:Request)=>Promise<Response>=async ()=>new Response();
	onwebsocket:(controller:{
		request:Request
		accept:()=>Promise<WebSocketServerConnection> //Only accept before 'onwebsocket' resolved.
	})=>Promise<void>=async ()=>{};
	async serve(stream:{r:ExtendStreamReader,w:WritableStreamDefaultWriter<Uint8Array>}){
		try{
			while(true){
				let req=await this.pParseHttpRequest(stream.r);
				if(req.headers.get('upgrade')?.toLowerCase()==='websocket'){
					let that=this;
					let p={
						_ws:null as null|WebSocketServerStreamHandler,
						request:req,
						accept:async function(){
							if(this._ws==null){
								this._ws=new WebSocketServerStreamHandler(stream.r,stream.w);
								that.pWriteResponse(stream.w,await this._ws.switchToWebsocketResponse(this.request));
							}
							return this._ws;
						}
					};
					await this.onwebsocket(p);
					if(p._ws==null){
						await this.pWriteResponse(stream.w,new Response("Unsupported",{status:426}))
					}else{
						await p._ws.closed.get();;
					}
				}else{
					let resp=await this.onfetch(req);
					await this.pWriteResponse(stream.w,resp);
				}
				if(req.headers.get('connection')?.toLocaleLowerCase()==='close'){
					break;
				}
			}
		}catch(err){}
	}
	*serveTjs(serverSocket:tjs.Listener){
		let {TjsReaderDataSource,TjsWriterDataSink}=yield* Task.yieldWrap(import("partic2/tjshelper/tjsutil"));
		while(!(Task.getAbortSignal()?.aborted??false)){
			let soc=yield* Task.yieldWrap(serverSocket.accept());
			let r=new ExtendStreamReader(new ReadableStream(new TjsReaderDataSource(soc)).getReader());
			let w=new WritableStream(new TjsWriterDataSink(soc)).getWriter();
			let that=this;
			Task.fork(function*(){
				try{
					yield that.serve({r,w})
				}finally{
					w.close();
				}
			}).run();
		}
	}
	protected async pParseHttpRequest(r:ExtendStreamReader){
		let header1=await parseHttpRequestHeader(r);
		let bodySource
		if(header1.headers.get('transfer-encoding')?.includes('chunked')){
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					let length=Number(decode(await r.readUntil('\n'.charCodeAt(0))).trim());
					if(length==0){
						let eoc=await r.readForNBytes(2);
						//assert(eoc[0]==0xd && eoc[1]==0xa);
						controller.close();
					}else{
						let buf=await r.readForNBytes(length);
						let eoc=await r.readForNBytes(2);
						//assert(eoc[0]==0xd && eoc[1]==0xa);
						controller.enqueue(buf);
					}
				}
			}
		}else if(header1.headers.has('content-length')){
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					let contentLength=Number(header1.headers.get('content-length')!.trim());
					controller.enqueue(await r.readForNBytes(contentLength));
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
			headers:header1.headers,
			duplex: 'half' //BUG:TS complain with it, but it's required in this case.
		} as RequestInit);
		return req;
	}
	protected async pWriteResponse(w:WritableStreamDefaultWriter<Uint8Array>,resp:Response){
		let headersString=new Array<string>();
		let chunked=resp.headers.get('transfer-encoding')?.includes('chunked')
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
						await w.write(new Uint8Array(ArrayBufferConcat([encode(chunk.length.toString(16)+'\r\n'),chunk,encode('\r\n')])));
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

interface BasicRequest{
	readonly method:string
	readonly url:string
	readonly body:ReadableStream<Uint8Array> | null
	readonly headers: Headers
	readonly arrayBuffer: () => Promise<ArrayBuffer>
}

export class HttpClient{
	protected async pWriteRequest(w:WritableStreamDefaultWriter<Uint8Array>,req:BasicRequest){
		let purl=new URL(req.url);
		let headersString=new Array<string>();
		let chunked=req.headers.get('transfer-encoding')?.includes('chunked')??false;
		if(!req.headers.has('host')){
			headersString.push('Host:'+purl.host);
		}
		req.headers.forEach((val,key)=>{
			headersString.push(`${key}: ${val}`);
		});
		let nonChunkBody:ArrayBuffer|null=null;
		if(!chunked && !req.headers.has('content-length')){
			nonChunkBody=await req.arrayBuffer();
			headersString.push('Content-Length:' +String(nonChunkBody.byteLength));
		}
		await w.write(encode(
			[
				`${req.method} ${purl.pathname}${purl.search} HTTP/1.1`,
				...headersString,
				'\r\n'
			].join('\r\n'))
		);
		if(req.body!=undefined){
			if(chunked){
				await req.body.pipeTo(new WritableStream({
					write:async (chunk: Uint8Array, controller: WritableStreamDefaultController)=>{
						await w.write(new Uint8Array(ArrayBufferConcat([encode(chunk.length.toString(16)+'\r\n'),chunk,encode('\r\n')])));
					}
				}));
				await w.write(encode('0\r\n\r\n'));
			}else if(nonChunkBody!=null){
				await w.write(new Uint8Array(nonChunkBody!));
			}else{
				await req.body.pipeTo(new WritableStream({
					write:async (chunk: Uint8Array, controller: WritableStreamDefaultController)=>{
						await w.write(chunk);
					}
				}));
			}
		}
	}
	protected async pParseHttpResponse(r:ExtendStreamReader){
		let header1=await parseHttpResponseHeader(r);
		let bodySource:any
		if(header1.headers.get('transfer-encoding')?.includes('chunked')){
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					let length=Number(decode(await r.readUntil('\n'.charCodeAt(0))).trim());
					if(length==0){
						let eoc=await r.readForNBytes(2);
						//assert(eoc[0]==0xd && eoc[1]==0xa);
						controller.close();
					}else{
						let buf=await r.readForNBytes(length);
						let eoc=await r.readForNBytes(2);
						//assert(eoc[0]==0xd && eoc[1]==0xa);
						controller.enqueue(buf);
					}
				}
			}
		}else if(header1.headers.has('content-length')){
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					let contentLength=Number(header1.headers.get('content-length')!.trim());
					let buf=await r.readForNBytes(contentLength);
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
		let status=Number(header1.status);
		if(status===101){
			let resp=new ProtocolSwitchResponse(null,{
				statusText:header1.statusText,
				headers:header1.headers
			});
			return resp;
		}else{
			let resp=new Response(new ReadableStream(bodySource),{
				status:Number(header1.status),
				statusText:header1.statusText,
				headers:header1.headers
			});
			return resp;
		}
	}
	protected connections:Record<string,{r:ExtendStreamReader,w:WritableStreamDefaultWriter<Uint8Array>}>={};
	connector:((url:URL)=>Promise<{r:ExtendStreamReader,w:WritableStreamDefaultWriter<Uint8Array>}>)|null=null;
	connect(connector:(url:URL)=>Promise<{r:ExtendStreamReader,w:WritableStreamDefaultWriter<Uint8Array>}>){
		this.connector=connector;
		return this;
	}
	connectTjs(tjsConn?:typeof tjs.connect){
		return this.connect(async (url:URL)=>{
			let target={
				host:url.hostname,
				port:0
			}
			if(url.port===''){
				if(['http:','ws:'].includes(url.protocol)){
					target.port=80
				}else if(['https:','wss:'].includes(url.protocol)){
					target.port=443
					//TODO: SSL support
				}
			}else{
				target.port=Number.parseInt(url.port);
			}
			if(tjsConn==undefined){
				let {buildTjs}=await import('./tjsbuilder');
				tjsConn=(await buildTjs()).connect;
			}
			let c=await tjsConn('tcp',target.host,target.port) as tjs.Connection;
			return {
				r:new ExtendStreamReader(new ReadableStream(new TjsReaderDataSource(c)).getReader()),
				w:new WritableStream(new TjsWriterDataSink(c)).getWriter()
			}
		})
	}
	async fetch(req:Request){
		assert(this.connector!=null);
		let purl=new URL(req.url);
		let cid=purl.origin
		if(this.connections[cid]==undefined){
			let newConn=await this.connector(purl);
			this.connections[cid]=newConn;
			newConn.r.closed.then(()=>{delete this.connections[cid]});
		}
		let {r,w}=this.connections[cid];
		await this.pWriteRequest(w,req);
		return await this.pParseHttpResponse(r);
	}
	async websocket(url:string){
		assert(this.connector!=null);
		let purl=new URL(url);
		let {r,w}=await this.connector(purl);
		let req=new Request(url,{
			headers:{
				Upgrade:'websocket',Connection:'Upgrade',
				'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
				'Sec-WebSocket-Version': '13'}
		});
		await this.pWriteRequest(w,req)
		let resp=await this.pParseHttpResponse(r);
		assert(resp.status==101);
		return new WebSocketClientStreamHandler(r,w);
	}
	close(){
		for(let t1 of Object.values(this.connections)){
			t1.w.close();
		}
	}
}

interface HttpRouterHandler{
	fetch?:(request:Request)=>Promise<Response>
	websocket?:(controller:{
		request:Request
		accept:()=>Promise<WebSocketServerConnection> //Only accept before 'onwebsocket' resolved.
	})=>Promise<void>,
	map?:Record<string,HttpRouterHandler>
}

export class SimpleHttpServerRouter{
	constructor(){};
	root:HttpRouterHandler={map:{}}
	onfetch=async (req:Request):Promise<Response>=>{
		let {pathname}=new URL(req.url);
		let parts=pathname.substring(1).split(/\//).filter(t1=>t1!='');
		let cur=this.root;
		for(let t1 of parts){
			cur=cur.map![t1];
			if(cur==undefined){
				return new Response(null,{status:404});
			}if(cur.fetch!=undefined){
				return await cur.fetch(req);
			}
		}
		return new Response(null,{status:404});
	}
	onwebsocket=async (controller:{
		request:Request
		accept:()=>Promise<WebSocketServerConnection>
	})=>{
		let req=controller.request;
		let {pathname}=new URL(req.url);
		let parts=pathname.substring(1).split(/\//).filter(t1=>t1.length>0);
		let cur=this.root;
		for(let t1 of parts){
			cur=cur.map![t1];
			if(cur==undefined){
				break;
			}if(cur.websocket!=undefined){
				await cur.websocket(controller);
				break;
			}
		}
	}
	setHandler(prefix:string,handler:null|HttpRouterHandler){
		let parts=prefix.substring(1).split(/\//).filter(t1=>t1.length>0);
		let cur:HttpRouterHandler|undefined=this.root;
		let parent:HttpRouterHandler|undefined=undefined;
		if(parts.length==0 && handler!=null){
			this.root=handler;
		}else{
			for(let t1 of parts){
				parent=cur;
				cur=cur!.map![t1];
				if(cur==undefined){
					cur={map:{}}
					parent!.map![t1]=cur;
				}
			}
			if(handler!=null){
				parent!.map![parts.at(-1)!]=handler
			}else{
				delete parent!.map![parts.at(-1)!];
			}
		}
	}
}

export class SimpleFileServer{
    constructor(public fs:SimpleFileSystem){}
	pathStartAt=0;
	showIndex=true;
	cacheControl:(filePath:string)=>Promise<{maxAge:number}|'no-cache'|'no-store'>=async (filepath:string)=>({maxAge:86400})
	interceptor:(filePath:string)=>Promise<Response|null>=async ()=>null;
    onfetch=async (req:Request):Promise<Response>=>{
		let {pathname}=new URL(req.url)
        let filepath=decodeURIComponent(pathname.substring(this.pathStartAt));
        try{
			{
				let t1=await this.interceptor(filepath);
				if(t1!==null){
					return t1;
				}
			}
			let filetype=await this.fs.filetype(filepath);
			if(filetype==='file'){
				let statResult=await this.fs.stat(filepath);
				let headers=new Headers();
				headers.set('date',GetCurrentTime().toUTCString())
				let t1=await this.cacheControl(filepath);
				if(typeof t1==='string'){
					headers.set('cache-control',t1);
				}else{
					headers.set('cache-control','max-age='+t1.maxAge);
				}
				if(t1!=='no-store'){
					let etag=String(statResult.mtime.getTime());
					headers.set('etag',etag);
					let ifNoneMatch=req.headers.get('If-None-Match');
					if(ifNoneMatch===etag){
						return new Response(null,{status:304,headers})
					}
				}
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
				if(statResult.size<0x8192){
					headers.set('content-length',String(statResult.size));
				}else{
					headers.set('transfer-encoding','chunked')
				}
				return new Response(simpleFileSystemHelper.getFileSystemReadableStream(this.fs,filepath),
						{status:200,headers});
			}else if(filetype==='dir' && this.showIndex){
				let children=await this.fs.listdir(filepath);
				let lastName=pathname.substring(Math.max(0,pathname.lastIndexOf('/')));
				return new Response(`<!DOCTYPE html>
				<html><head><meta charset="UTF-8"/></head>
					<body>${children.map(t1=>`<div><a href=".${lastName}/${t1.name}">${t1.name}</a></div>`).join('')}</body>
				</html>`,{
					headers:{'content-type':'text/html'}
				})
			}else{
				throw new Error('Unsupported filetype');
			}
        }catch(err:any){
            return new Response(err.toString(),{status:404});
        }
    }

}