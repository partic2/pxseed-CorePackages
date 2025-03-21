/*jshint node:true */

const kOnHeaders = 1;
const kOnHeadersComplete = 2;
const kOnBody = 3;
const kOnMessageComplete = 4;

const headerExp = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
const headerContinueExp = /^[ \t]+(.*[^ \t])/;
const requestExp = /^([A-Z-]+) ([^ ]+) HTTP\/(\d)\.(\d)$/;
const responseExp = /^HTTP\/(\d)\.(\d) (\d{3}) ?(.*)$/;

class ParseError extends Error{
  constructor(msg?:string){super(msg);}
  code?:string
}

function parseErrorCode(code:string) {
    var err = new ParseError('Parse Error');
    err.code = code;
    return err;
}

class HTTPParser{
    
    static maxHeaderSize = 80 * 1024;
    static REQUEST = 'REQUEST'
    static RESPONSE = 'RESPONSE'
    static encoding = 'utf-8'
    
    static methods = [
        'DELETE',
        'GET',
        'HEAD',
        'POST',
        'PUT',
        'CONNECT',
        'OPTIONS',
        'TRACE',
        'COPY',
        'LOCK',
        'MKCOL',
        'MOVE',
        'PROPFIND',
        'PROPPATCH',
        'SEARCH',
        'UNLOCK',
        'BIND',
        'REBIND',
        'UNBIND',
        'ACL',
        'REPORT',
        'MKACTIVITY',
        'CHECKOUT',
        'MERGE',
        'M-SEARCH',
        'NOTIFY',
        'SUBSCRIBE',
        'UNSUBSCRIBE',
        'PATCH',
        'PURGE',
        'MKCALENDAR',
        'LINK',
        'UNLINK',
        'SOURCE',
      ];

    type=''
    state=''
    info:{
        statusMessage?: string;
        statusCode?: number;
        shouldKeepAlive?: boolean;
        headers:string[],
        upgrade:boolean,
        method?:number,
        url?:string,
        versionMajor?:number,
        versionMinor?:number
    }={
        headers:[],
        upgrade:false
    }
    
    maxHeaderSize?: number;
    trailers = []
    line=''
    isChunked = false
    connection = ''
    headerSize = 0;
    body_bytes:number|null = null;
    isUserCall = false;
    hadError = false;
    [kOnHeaders]:(hdr:string[],opt:string)=>void=function(){};
    [kOnHeadersComplete]:(versionMajor:number,versionMinor:number,headers:string[],method:number,url:string,statusCode:number,statusMessage:string,upgrade:boolean,shouldKeepAlive:boolean)=>void=function(){};
    [kOnBody]:(body:Uint8Array,start:number,end:number)=>void=function(){};
    [kOnMessageComplete]=function(){};
    close =function(){}
    pause =function(){}
    resume =function(){}
    remove =function(){}
    free = function(){};
    

    // These three methods are used for an internal speed optimization, and it also
    // works if theses are noops. Basically consume() asks us to read the bytes
    // ourselves, but if we don't do it we get them through execute().
    consume = function () {};
    unconsume = function () {};
    getCurrentBuffer = function () {};

    headerState = {
        REQUEST_LINE: true,
        RESPONSE_LINE: true,
        HEADER: true
    } as Record<string,boolean>;
    stateFinishAllowed = {
        REQUEST_LINE: true,
        RESPONSE_LINE: true,
        BODY_RAW: true
    } as Record<string,boolean>;

    constructor(type:string){
        if (type !== undefined && type !== HTTPParser.REQUEST && type !== HTTPParser.RESPONSE) {
            throw new Error('type must be REQUEST or RESPONSE');
        }
        if (type === undefined) {
            // Node v12+
        } else {
            this.initialize(type);
        }
        this.maxHeaderSize=HTTPParser.maxHeaderSize
    }
    initialize(type:string, async_resource?:any) {
        this.type = type;
        this.state = type + '_LINE';
        this.info = {
            headers: [],
            upgrade: false
        };
        this.trailers = [];
        this.line = '';
        this.isChunked = false;
        this.connection = '';
        this.headerSize = 0; // for preventing too big headers
        this.body_bytes = null;
        this.isUserCall = false;
        this.hadError = false;
    }

    chunk:Uint8Array|null=null
    offset=0;
    end=0;
    execute(chunk:Uint8Array, start?:number, length?:number) {

        // backward compat to node < 0.11.4
        // Note: the start and length params were removed in newer version
        start = start || 0;
        length = typeof length === 'number' ? length : chunk.length;
      
        this.chunk = chunk;
        this.offset = start;
        var end = this.end = start + length;
        try {
          while (this.offset < end) {
            if ((this as any)[this.state]()) {
              break;
            }
          }
        } catch (err) {
          if (this.isUserCall) {
            throw err;
          }
          this.hadError = true;
          return err;
        }
        this.chunk = null;
        length = this.offset - start;
        if (this.headerState[this.state]) {
          this.headerSize += length;
          if (this.headerSize > (this.maxHeaderSize||HTTPParser.maxHeaderSize)) {
            return new Error('max header size exceeded');
          }
        }
        return length;
    };
    finish() {
        if (this.hadError) {
          return;
        }
        if (!this.stateFinishAllowed[this.state]) {
          return new Error('invalid state for EOF');
        }
        if (this.state === 'BODY_RAW') {
          this.userCall()(this[kOnMessageComplete]());
        }
    };
    //For correct error handling - see HTTPParser#execute
    //Usage: this.userCall()(userFunction('arg'));
    userCall() {
        this.isUserCall = true;
        var self = this;
        return function (ret:any) {
          self.isUserCall = false;
          return ret;
        };
    };
    nextRequest() {
        this.userCall()(this[kOnMessageComplete]());
        this.reinitialize(this.type);
    };
    reinitialize(type:string){
        this.initialize(type);
    }
    _stringDecode(chunk:Uint8Array,start?:number,end?:number){
        start=0;
        end=chunk.byteLength;
        return new TextDecoder().decode(new Uint8Array(chunk.buffer,chunk.byteOffset+start,end-start));
    }
    consumeLine() {
        var end = this.end,
            chunk = this.chunk!;
        for (var i = this.offset; i < end; i++) {
        if (chunk[i] === 0x0a) { // \n
            var line = this.line + this._stringDecode(chunk,this.offset,i);
            if (line.charAt(line.length - 1) === '\r') {
            line = line.substr(0, line.length - 1);
            }
            this.line = '';
            this.offset = i + 1;
            return line;
        }
        }
        //line split over multiple chunks
        this.line += this._stringDecode(chunk, this.offset, this.end);
        this.offset = this.end;
    };
    parseHeader(line:string, headers:string[]) {
        if (line.indexOf('\r') !== -1) {
            throw parseErrorCode('HPE_LF_EXPECTED');
        }
        
        var match = headerExp.exec(line);
        var k = match && match[1];
        if (k) { // skip empty string (malformed header)
            headers.push(k);
            headers.push(match![2]);
        } else {
            var matchContinue = headerContinueExp.exec(line);
            if (matchContinue && headers.length) {
            if (headers[headers.length - 1]) {
                headers[headers.length - 1] += ' ';
            }
            headers[headers.length - 1] += matchContinue[1];
            }
        }
    };
    REQUEST_LINE () {
        var line = this.consumeLine();
        if (!line) {
          return;
        }
        var match = requestExp.exec(line);
        if (match === null) {
          throw parseErrorCode('HPE_INVALID_CONSTANT');
        }
        this.info.method = HTTPParser.methods.indexOf(match[1]);
        if (this.info.method === -1) {
          throw new Error('invalid request method');
        }
        this.info.url = match[2];
        this.info.versionMajor = +match[3];
        this.info.versionMinor = +match[4];
        this.body_bytes = 0;
        this.state = 'HEADER';
    };
    RESPONSE_LINE() {
        var line = this.consumeLine();
        if (!line) {
          return;
        }
        var match = responseExp.exec(line);
        if (match === null) {
          throw parseErrorCode('HPE_INVALID_CONSTANT');
        }
        this.info.versionMajor = +match[1];
        this.info.versionMinor = +match[2];
        var statusCode = this.info.statusCode = +match[3];
        this.info.statusMessage = match[4];
        // Implied zero length.
        if ((statusCode / 100 | 0) === 1 || statusCode === 204 || statusCode === 304) {
          this.body_bytes = 0;
        }
        this.state = 'HEADER';
    };
    shouldKeepAlive() {
        if (this.info.versionMajor! > 0 && this.info.versionMinor! > 0) {
          if (this.connection.indexOf('close') !== -1) {
            return false;
          }
        } else if (this.connection.indexOf('keep-alive') === -1) {
          return false;
        }
        if (this.body_bytes !== null || this.isChunked) { // || skipBody
          return true;
        }
        return false;
    };
    HEADER() {
        var line = this.consumeLine();
        if (line === undefined) {
          return;
        }
        var info = this.info;
        if (line) {
          this.parseHeader(line, info.headers);
        } else {
          var headers = info.headers;
          var hasContentLength = false;
          var currentContentLengthValue;
          var hasUpgradeHeader = false;
          for (var i = 0; i < headers.length; i += 2) {
            switch (headers[i].toLowerCase()) {
              case 'transfer-encoding':
                this.isChunked = headers[i + 1].toLowerCase() === 'chunked';
                break;
              case 'content-length':
                currentContentLengthValue = +headers[i + 1];
                if (hasContentLength) {
                  // Fix duplicate Content-Length header with same values.
                  // Throw error only if values are different.
                  // Known issues:
                  // https://github.com/request/request/issues/2091#issuecomment-328715113
                  // https://github.com/nodejs/node/issues/6517#issuecomment-216263771
                  if (currentContentLengthValue !== this.body_bytes) {
                    throw parseErrorCode('HPE_UNEXPECTED_CONTENT_LENGTH');
                  }
                } else {
                  hasContentLength = true;
                  this.body_bytes = currentContentLengthValue;
                }
                break;
              case 'connection':
                this.connection += headers[i + 1].toLowerCase();
                break;
              case 'upgrade':
                hasUpgradeHeader = true;
                break;
            }
          }
      
          // if both isChunked and hasContentLength, isChunked wins
          // This is required so the body is parsed using the chunked method, and matches
          // Chrome's behavior.  We could, maybe, ignore them both (would get chunked
          // encoding into the body), and/or disable shouldKeepAlive to be more
          // resilient.
          if (this.isChunked && hasContentLength) {
            hasContentLength = false;
            this.body_bytes = null;
          }
      
          // Logic from https://github.com/nodejs/http-parser/blob/921d5585515a153fa00e411cf144280c59b41f90/http_parser.c#L1727-L1737
          // "For responses, "Upgrade: foo" and "Connection: upgrade" are
          //   mandatory only when it is a 101 Switching Protocols response,
          //   otherwise it is purely informational, to announce support.
          if (hasUpgradeHeader && this.connection.indexOf('upgrade') != -1) {
            info.upgrade = this.type === HTTPParser.REQUEST || info.statusCode === 101;
          } else {
            info.upgrade = info.method === method_connect;
          }
      
          if (this.isChunked && info.upgrade) {
            this.isChunked = false;
          }
      
          info.shouldKeepAlive = this.shouldKeepAlive();
          //problem which also exists in original node: we should know skipBody before calling onHeadersComplete
          var skipBody;

          skipBody = this.userCall()(this[kOnHeadersComplete](info.versionMajor!,
                info.versionMinor!, info.headers, info.method!, info.url!, info.statusCode!,
                info.statusMessage!, info.upgrade!, info.shouldKeepAlive!));

          if (skipBody === 2) {
            this.nextRequest();
            return true;
          } else if (this.isChunked && !skipBody) {
            this.state = 'BODY_CHUNKHEAD';
          } else if (skipBody || this.body_bytes === 0) {
            this.nextRequest();
            // For older versions of node (v6.x and older?), that return skipBody=1 or skipBody=true,
            //   need this "return true;" if it's an upgrade request.
            return info.upgrade;
          } else if (this.body_bytes === null) {
            this.state = 'BODY_RAW';
          } else {
            this.state = 'BODY_SIZED';
          }
        }
      };
      BODY_CHUNKHEAD() {
        var line = this.consumeLine();
        if (line === undefined) {
          return;
        }
        this.body_bytes = parseInt(line, 16);
        if (!this.body_bytes) {
          this.state = 'BODY_CHUNKTRAILERS';
        } else {
          this.state = 'BODY_CHUNK';
        }
      };
      BODY_CHUNK() {
        var length = Math.min(this.end - this.offset, this.body_bytes!);
        // 0, length are for backwards compatibility. See: https://github.com/creationix/http-parser-js/pull/98
        this.userCall()(this[kOnBody](this.chunk!.slice(this.offset, this.offset + length), 0, length));
        this.offset += length;
        this.body_bytes! -= length;
        if (!this.body_bytes) {
          this.state = 'BODY_CHUNKEMPTYLINE';
        }
      };
      BODY_CHUNKEMPTYLINE() {
        var line = this.consumeLine();
        if (line === undefined) {
          return;
        }
        if (line !== '') {
          throw new Error('Expected empty line');
        }
        this.state = 'BODY_CHUNKHEAD';
      };
      BODY_CHUNKTRAILERS() {
        var line = this.consumeLine();
        if (line === undefined) {
          return;
        }
        if (line) {
          this.parseHeader(line, this.trailers);
        } else {
          if (this.trailers.length) {
            this.userCall()(this[kOnHeaders](this.trailers, ''));
          }
          this.nextRequest();
        }
      };
      BODY_RAW() {
        // 0, length are for backwards compatibility. See: https://github.com/creationix/http-parser-js/pull/98
        this.userCall()(this[kOnBody](this.chunk!.slice(this.offset, this.end), 0, this.end - this.offset));
        this.offset = this.end;
      };
      BODY_SIZED() {
        var length = Math.min(this.end - this.offset, this.body_bytes!);
        // 0, length are for backwards compatibility. See: https://github.com/creationix/http-parser-js/pull/98
        this.userCall()(this[kOnBody](this.chunk!.slice(this.offset, this.offset + length), 0, length));
        this.offset += length;
        this.body_bytes! -= length;
        if (!this.body_bytes) {
            this.nextRequest();
        }
    };
}


const method_connect = HTTPParser.methods.indexOf('CONNECT');



function fmtHdrKey(key:string) {
	return key.toLowerCase();
}
;

class HttpIncomingRequest {
	#parser:HTTPParser;
	#sock;
	constructor(parser:HTTPParser, sock:tjs.Connection) {
		this.#parser = parser;
		this.#sock = sock;
	}

	get method() {
		return HTTPParser.methods[this.#parser.info.method!];
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
	const parser = new HTTPParser(HTTPParser.REQUEST);
	const buf = new Uint8Array(1024);
	let res;
	let len;

	do {
		len = await conn.read(buf);

		if (len !== null) {
			res = parser.execute(buf.subarray(0, len));
		}
	} while (res === true && len !== null);

	return new HttpIncomingRequest(parser, conn);
}