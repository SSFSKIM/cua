// Dependency-free average-luminance hash. JPEG needs only block DC coefficients (a 1/8-scale
// thumbnail), not an IDCT or chroma. Baseline and the first progressive DC scan are supported.
// This is diagnostic similarity, not pixel equality; dimensions always compare exactly.
import {inflateSync} from 'node:zlib';
function averageHash(pixels,width,height) {
  const sums=Array(64).fill(0),counts=Array(64).fill(0);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const cell=Math.min(7,Math.floor(y*8/height))*8+Math.min(7,Math.floor(x*8/width));
    sums[cell]+=pixels[y*width+x];counts[cell]++;
  }
  const means=sums.map((v,i)=>counts[i]?v/counts[i]:pixels[Math.min(height-1,Math.floor((Math.floor(i/8)+.5)*height/8))*width+Math.min(width-1,Math.floor((i%8+.5)*width/8))]),avg=means.reduce((a,b)=>a+b,0)/64;
  return means.reduce((bits,v)=>(bits<<1n)|BigInt(v>avg),0n).toString(16).padStart(16,'0');
}
const bounded=(w,h)=>{if(!w||!h||w*h>40_000_000)throw new Error('Image dimensions exceed harness limit');};
function png(bytes) {
  let offset=8,width,height,depth,color,interlace,palette;const chunks=[];
  while(offset+12<=bytes.length) {
    const len=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+len);
    if(offset+12+len>bytes.length)throw new Error('Truncated PNG image');
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];color=data[9];interlace=data[12];}
    if(type==='PLTE')palette=data;
    if(type==='IDAT')chunks.push(data);
    offset+=len+12;if(type==='IEND')break;
  }
  bounded(width,height);
  const channels={0:1,2:3,3:1,4:2,6:4}[color];
  if(depth!==8||interlace!==0||!channels)throw new Error('Unsupported PNG screenshot encoding');
  const stride=width*channels,raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:(stride+1)*height});
  if(raw.length!==(stride+1)*height)throw new Error('Truncated PNG pixels');
  const pixels=new Float64Array(width*height);let previous=Buffer.alloc(stride);
  for(let y=0;y<height;y++) {
    const row=Buffer.from(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1))),filter=raw[y*(stride+1)];
    for(let x=0;x<stride;x++) {
      const a=x>=channels?row[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0;
      let predict;
      if(filter===0)predict=0;else if(filter===1)predict=a;else if(filter===2)predict=b;else if(filter===3)predict=Math.floor((a+b)/2);
      else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);predict=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
      else throw new Error('Invalid PNG filter');
      row[x]=(row[x]+predict)&255;
    }
    for(let x=0;x<width;x++) {
      const i=x*channels;
      let lum,alpha=255;
      if(color===0||color===4){lum=row[i];if(color===4)alpha=row[i+1];}
      else if(color===3){const p=row[i]*3;if(!palette||p+2>=palette.length)throw new Error('Invalid PNG palette');lum=.299*palette[p]+.587*palette[p+1]+.114*palette[p+2];}
      else {lum=.299*row[i]+.587*row[i+1]+.114*row[i+2];if(color===6)alpha=row[i+3];}
      pixels[y*width+x]=lum*alpha/255+255-alpha;
    }
    previous=row;
  }
  return {width,height,hash:averageHash(pixels,width,height)};
}
function jpeg(bytes) {
  let pos=2,width,height,components,maxH,maxV,progressive=false,restart=0;
  const tables=new Map();
  while(pos<bytes.length) {
    if(bytes[pos++]!==255)throw new Error('Invalid JPEG marker');
    while(bytes[pos]===255)pos++;
    const marker=bytes[pos++];if(marker===0xd9)break;
    const length=bytes.readUInt16BE(pos),end=pos+length;pos+=2;
    if(end>bytes.length)throw new Error('Truncated JPEG segment');
    if(marker===0xc0||marker===0xc2) {
      progressive=marker===0xc2;
      if(bytes[pos]!==8)throw new Error('Unsupported JPEG sample precision');
      height=bytes.readUInt16BE(pos+1);width=bytes.readUInt16BE(pos+3);bounded(width,height);
      const n=bytes[pos+5];components=[];
      for(let i=0;i<n;i++){const at=pos+6+i*3;components.push({id:bytes[at],h:bytes[at+1]>>4,v:bytes[at+1]&15,dc:0});}
      maxH=Math.max(...components.map(c=>c.h));maxV=Math.max(...components.map(c=>c.v));
    } else if(marker===0xc4) {
      while(pos<end){const id=bytes[pos++],counts=[...bytes.subarray(pos,pos+16)];pos+=16;const table=new Map();let code=0;
        for(let len=1;len<=16;len++){for(let n=0;n<counts[len-1];n++)table.set(`${len}:${code++}`,bytes[pos++]);code<<=1;}
        tables.set(id,table);
      }
    } else if(marker===0xdd) restart=bytes.readUInt16BE(pos);
    else if(marker===0xda) {
      if(!components)throw new Error('JPEG frame missing');
      const count=bytes[pos++],scan=[];
      for(let i=0;i<count;i++){const c=components.find(c=>c.id===bytes[pos++]),selector=bytes[pos++];if(!c)throw new Error('Invalid JPEG component');scan.push({...c,dcTable:tables.get(selector>>4),acTable:tables.get(16+(selector&15))});}
      const ss=bytes[pos++],se=bytes[pos++],approx=bytes[pos++];
      if(progressive&&(ss!==0||se!==0||(approx>>4)!==0))throw new Error('JPEG first scan must contain initial DCs');
      if(!scan.some(c=>c.id===components[0].id))throw new Error('JPEG first scan lacks luminance');
      pos=end;let bits=0,bitCount=0;
      const readBit=()=>{
        if(!bitCount){if(pos>=bytes.length)throw new Error('Truncated JPEG scan');bits=bytes[pos++];if(bits===255&&bytes[pos++]!==0)throw new Error('Unexpected JPEG scan marker');bitCount=8;}
        return (bits>>--bitCount)&1;
      };
      const readBits=n=>{let x=0;while(n--)x=(x<<1)|readBit();return x;};
      const symbol=table=>{if(!table)throw new Error('Missing JPEG Huffman table');let code=0;for(let n=1;n<=16;n++){code=(code<<1)|readBit();const v=table.get(`${n}:${code}`);if(v!==undefined)return v;}throw new Error('Invalid JPEG Huffman code');};
      const dc=c=>{const n=symbol(c.dcTable),raw=readBits(n);c.dc+=n&&raw<(1<<(n-1))?raw-((1<<n)-1):raw;return c.dc;};
      const y=components[0],cols=Math.ceil(width/(8*maxH)),rows=Math.ceil(height/(8*maxV));
      const blockWidth=Math.ceil(width*y.h/maxH/8),blockHeight=Math.ceil(height*y.v/maxV/8);
      const pixels=new Float64Array(blockWidth*blockHeight);
      const single=scan.length===1,mcus=single?blockWidth*blockHeight:cols*rows;
      for(let mcu=0;mcu<mcus;mcu++) {
        if(restart&&mcu&&mcu%restart===0){bitCount=0;if(bytes[pos++]!==255)throw new Error('Missing JPEG restart');while(bytes[pos]===255)pos++;const r=bytes[pos++];if(r<0xd0||r>0xd7)throw new Error('Invalid JPEG restart');for(const c of scan)c.dc=0;}
        for(const c of scan)for(let vy=0;vy<(single?1:c.v);vy++)for(let hx=0;hx<(single?1:c.h);hx++) {
          const value=dc(c);
          if(c.id===y.id){const x=single?mcu%blockWidth:(mcu%cols)*c.h+hx,by=single?Math.floor(mcu/blockWidth):Math.floor(mcu/cols)*c.v+vy;if(x<blockWidth&&by<blockHeight)pixels[by*blockWidth+x]=value;}
          if(!progressive)for(let k=1;k<64;k++){const ac=symbol(c.acTable),n=ac&15,run=ac>>4;if(!n){if(run===15){k+=15;continue;}break;}k+=run;readBits(n);}
        }
      }
      return {width,height,hash:averageHash(pixels,blockWidth,blockHeight)};
    }
    pos=end;
  }
  throw new Error('JPEG image has no decodable scan');
}
export function imageHash(bytes) {
  const data=Buffer.from(bytes);
  if(data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return {$image:'ahash64',...png(data)};
  if(data[0]===255&&data[1]===216)return {$image:'ahash64',...jpeg(data)};
  throw new Error('Unsupported image encoding (expected PNG or JPEG)');
}
