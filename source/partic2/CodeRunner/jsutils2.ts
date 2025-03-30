import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, Ref2, Task, assert, requirejs } from "partic2/jsutils1/base";


let __name__=requirejs.getLocalRequireModule(require);

export class TaskLocalRef<T> extends Ref2<T>{
    taskLocalVarName=__name__+'.var-'+GenerateRandomString();
    constructor(defaultVal:T){
        super(defaultVal);
        let loc=Task.locals();
        if(loc!=undefined){
            loc[this.taskLocalVarName]=defaultVal;
        }
    }
    public get(): T {
        let loc=Task.locals();
        if(loc!=undefined){
            return loc[this.taskLocalVarName]??this.__val;
        }else{
            return super.get();
        }
    }
    public set(val: T): void {
        let loc=Task.locals();
        if(loc!=undefined){
            loc[this.taskLocalVarName]=val;
        }else{
            this.__val=val;
        }
    }
}

export class ExtendStreamReader implements ReadableStreamDefaultReader<Uint8Array>{
	constructor(public wrapped:ReadableStreamDefaultReader<Uint8Array>){}
	protected readBuffers=new ArrayWrap2<Uint8Array|null>();
	async read(): Promise<ReadableStreamReadResult<Uint8Array>> {
		this.onReadRequest();
		let next=await this.readBuffers.queueBlockShift();
		if(next!=null){
			return {done:false,value:next};
		}else{
			return {done:true,value:next};
		}
	}
	protected async onReadRequest(){
		//XXX:retry on next tick?
		if(this.readBuffers.arr().length==0){
			let next=await this.wrapped.read();
			if(next.done && next.value==undefined){
				this.readBuffers.queueSignalPush(null);
			}else{
				this.readBuffers.queueSignalPush(next.value!);
			}
		}
	}
	//push buffer back, like 'ungetc'.
	unshiftBuffer(data:Uint8Array){
		if(this.readBuffers.arr().length===0){
			this.readBuffers.queueSignalPush(data);
		}else{
			this.readBuffers.arr().unshift(data);
		}
	}
	cancelWaiting(){
		this.readBuffers.cancelWaiting();
	}
	releaseLock(): void {
		this.wrapped.releaseLock();
	}
	closed: Promise<any>=this.wrapped.closed;
	cancel(reason?: any): Promise<void> {
		return this.wrapped.cancel(reason);
	}
	async readUntil(mark:Uint8Array|number){
		let datas=new Array<Uint8Array>();
		//Slow but simple
		if(mark instanceof Uint8Array){
			assert(mark.length>0);
			for(let t3=0;t3<0x7fff;t3++){
				let t4=await this.readUntil(mark.at(-1)!);
				let lastPart=datas.at(-1);
				if(lastPart!=undefined && lastPart.buffer===t4.buffer && lastPart.byteOffset+lastPart.byteLength===t4.byteOffset){
					datas[datas.length-1]=new Uint8Array(t4.buffer,lastPart.byteOffset,lastPart.byteLength+t4.byteLength);
				}else{
					datas.push(t4);
				}
				if(t4.length===0 || t4.at(-1)!==mark.at(-1)){
					break; //EOF
				}
				let allMatched=true;
				for(let t5=0;t5<mark.length;t5++){
					if(mark[t5]!==t4[t4.length-mark.length+t5]){
						allMatched=false;
						break;
					}
				}
				if(allMatched)break;
			}
		}else{
			for(let t1=0;t1<0x7fff;t1++){
				let t2=await this.read();
				if(t2.value!=undefined){
					let found=t2.value.indexOf(mark);
					if(found>=0){
						datas.push(new Uint8Array(t2.value.buffer,t2.value.byteOffset,found+1));
						if(found<t2.value.length){
							this.unshiftBuffer(new Uint8Array(
								t2.value.buffer,t2.value.byteOffset+found+1,
								t2.value.byteLength-found-1));
						}
						break;
					}else{
						datas.push(t2.value);
					}
				}else{
					//EOF
					break;
				}
			}
		}
		let concated=(datas.length===1)?datas[0]:new Uint8Array(ArrayBufferConcat(datas));
		return concated;
	}
    async readInto(buffer:Uint8Array,writePos?:Ref2<number>){
        let nextPart=await this.read();
        if(nextPart.value!=undefined){
            let writeAt=0;
            if(writePos!=undefined)writeAt=writePos.get();
            let readBytes=Math.min(buffer.byteLength-writeAt,nextPart.value.byteLength);
            if(readBytes<nextPart.value.byteLength){
                let remain=new Uint8Array(nextPart.value.buffer,nextPart.value.byteOffset+readBytes,nextPart.value.byteLength-readBytes);
                this.unshiftBuffer(remain);
            }
            buffer.set(new Uint8Array(nextPart.value.buffer,nextPart.value.byteOffset,readBytes),writeAt);
            if(writePos!=undefined)writePos.set(writeAt+readBytes);
            return readBytes;
        }
        return null
    }
}

/*
class HttpIncomingRequest {
	#parser:HttpParser;
	#sock;
	constructor(parser:HttpParser, sock:tjs.Connection) {
		this.#parser = parser;
		this.#sock = sock;
	}

	get method() {
		return HttpParser.methods[this.#parser.info.method!];
	}

	get httpVersion() {
		const ver = this.#parser.info;

		return `${ver.versionMajor}.${ver.versionMinor}`;
	}

    _cachedHeaders?:Record<string,string>={}
	get headers() {
        if(this._cachedHeaders==undefined){
            this._cachedHeaders=Object.fromEntries(
                this.rawHeaders.map(v=>v.match(/(.+)=(.+)/)).map(v=>[v![1].trim().toLowerCase(),v![2].trim()])
            );
        }
        return this._cachedHeaders;
	}

    get rawHeaders(){
        return this.#parser.info.headers
    }

	get url() {
		return this.#parser.info.url;
	}

	get sock() {
		return this.#sock;
	}

	finish() {
		this.#parser.finish();
	}
}

const statusMessages:Record<number,string> = {
	200: "OK",
	201: "Created",
	202: "Accepted",
	204: "No Content",
	301: "Moved Permanently",
	302: "Found",
	304: "Not Modified",
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	500: "Internal Server Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Gateway Timeout",
	505: "HTTP Version Not Supported",
};

const HttpTransStates = {
	STATUS: 0,
	HEADERS: 1,
	BODY: 2,
	FINISHED: 3,
};

export class HTTPOutgoingResponse {
	#sock?:tjs.Connection;
	#encoder = new TextEncoder()
	#headers = new Map();
	#status:{code:number,message?:string} = { code: 200, message: undefined };
	#state = HttpTransStates.STATUS;

	constructor(sock:tjs.Connection) {
		this.#sock = sock;
	}

	get socket() {
		return this.#sock;
	}

	get statusCode() {
		return this.#status.code;
	}
	set statusCode(code) {
		if (!Number.isInteger(code) || code <= 0) {
			throw new RangeError("statusCode must be a positive integer");
		}

		this.#status.code = code;
	}

	get statusMessage() {
		return this.#status.message??'';
	}

	set statusMessage(message:string) {
		this.#status.message = message;
	}

	setHeader(key:string, value:string) {
		this.#headers.set(fmtHdrKey(key), value);
	}

	getHeader(key:string) {
		return this.#headers.get(fmtHdrKey(key));
	}

	hasHeader(key:string) {
		return this.#headers.has(fmtHdrKey(key));
	}

	removeHeader(key:string) {
		this.#headers.delete(fmtHdrKey(key));
	}

	#buildHeaderBuf() {
		const msg =
			this.#status.message ?? statusMessages[this.#status.code] ?? "Unknown";
		let lines = [`HTTP/1.1 ${this.#status.code} ${msg}`];

		for (const [key, value] of this.#headers) {
			if (Array.isArray(value)) {
				for (const v of value) {
					lines.push(`${key}: ${String(v)}`);
				}
			} else {
				lines.push(`${key}: ${String(value)}`);
			}
		}

		return this.#encoder.encode(lines.join("\r\n") + "\r\n");
	}

	async flushHeaders() {
		if (this.#state !== HttpTransStates.STATUS) {
			throw new Error("Headers have already been written");
		}

		this.#state = HttpTransStates.HEADERS;
		await this.#sock!.write(this.#buildHeaderBuf());
	}

	get transferEncoding() {
		const te = this.getHeader("Transfer-Encoding");

		return te ? String(te).trim().toLowerCase() : undefined;
	}

	get chunked() {
		return this.transferEncoding
			?.split(",")
			.map((v) => v.trim())
			.includes("chunked");
	}

	#chunkCount = 0;
	async #writeChunk(chunk:Uint8Array|string, last:boolean) {
		if (!(chunk instanceof Uint8Array)) {
			chunk = this.#encoder.encode(chunk);
		}

		if (this.#state === HttpTransStates.STATUS) {
			if (last) {
				this.setHeader("Content-Length", chunk.byteLength.toString());
			} else {
				this.setHeader("Transfer-Encoding", "chunked");
			}

			this.flushHeaders();
		}

		if (last) {
			this.#state = HttpTransStates.FINISHED;
		}

		this.#chunkCount++;

		if (this.chunked) {
			this.#sock!.write(
				this.#encoder.encode(chunk.byteLength.toString(16) + "\r\n"),
			);
			await this.#sock!.write(chunk);
			await this.#sock!.write(this.#encoder.encode("\r\n"));

			if (last) {
				await this.#sock!.write(this.#encoder.encode("0\r\n\r\n"));
			}
		} else {
			await this.#sock!.write(chunk);
		}

		if (last && !this.chunked && this.hasHeader("Content-Length")) {
			// close connection if no content-length and not chunked
			this.#sock!.close();
		}
	}

	#validateTransferEncoding() {
		const te = this.transferEncoding;
		// TODO: Add support for compression

		if (te !== undefined && te !== "chunked") {
			throw new Error("Unsupported transfer encoding");
		}
	}

	async writeBody(body:ReadableStream|Uint8Array|string) {
		if (this.#state === HttpTransStates.FINISHED) {
			throw new Error("Response already finished");
		}

		this.#validateTransferEncoding();

		if (body instanceof ReadableStream) {
			const reader = body.getReader();
			let chunk;

			do {
				chunk = await reader.read();

				if (chunk.done) {
					await this.#writeChunk(new Uint8Array(0), true);
				} else {
					await this.#writeChunk(chunk.value, false);
				}
			} while (chunk.done === false);
		} else {
			await this.#writeChunk(body, true);
		}
	}

	finish() {
		this.#sock!.close();
		this.#sock = undefined;
	}
}

export class HTTPServer {
	#listener;
	#handler;
	constructor(listener:tjs.Listener, handler:(req:HttpIncomingRequest,resp:HTTPOutgoingResponse)=>Promise<void>) {
		this.#listener = listener;
		this.#handler = handler;
	}

	async #handleConn(conn:tjs.Connection) {
		const req = await parseHttp(conn);
		await this.#handler(req, new HTTPOutgoingResponse(conn));
	}

	async start() {
		for await (let conn of this.#listener) {
			this.#handleConn(conn);
		}
	}
}

export async function parseHttp(conn:tjs.Connection) {
	const parser = new HttpParser(HttpParser.REQUEST);
	const buf = new Uint8Array(4096);
	let res;
	let len;

	do {
		len = await conn.read(buf);

		if (len !== null) {
      console.info('parse:'+new TextDecoder().decode(buf.subarray(0, len)))
			res = parser.execute(buf.subarray(0, len));
		}
	} while (res === true && len !== null);

	return new HttpIncomingRequest(parser, conn);
}
*/