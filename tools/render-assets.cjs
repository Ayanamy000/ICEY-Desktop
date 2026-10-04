const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root=path.resolve(__dirname,'..');
async function build(){
  const data=JSON.parse(fs.readFileSync(path.join(root,'verification/project-frames.json'),'utf8').replace(/^\uFEFF/,''));
  const textures={};for(const anim of data)textures[anim.texture]=fs.readFileSync(path.join(root,'verification/assets',anim.texture)).toString('base64');
  const browser=await chromium.launch({headless:true,...(process.env.ICEY_BROWSER_PATH?{executablePath:process.env.ICEY_BROWSER_PATH}:{})});
  try{
    const page=await browser.newPage();await page.setContent('<canvas width="640" height="480"></canvas>');
    const output=await page.evaluate(async({data,textures})=>{
      const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,alpha:true});
      if(!gl)throw Error('WebGL unavailable');
      function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
      const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 uv;varying vec2 v;void main(){gl_Position=vec4(p,0.,1.);v=uv;}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v;uniform sampler2D image;uniform vec4 color;void main(){gl_FragColor=texture2D(image,v)*color;}'));gl.linkProgram(program);gl.useProgram(program);
      const texes={};for(const[name,bytes]of Object.entries(textures)){const img=new Image();img.src='data:image/png;base64,'+bytes;await img.decode();const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);for(const opt of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,opt,gl.LINEAR);for(const opt of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,opt,gl.CLAMP_TO_EDGE);texes[name]=tex;}
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const p=gl.getAttribLocation(program,'p'),uv=gl.getAttribLocation(program,'uv');gl.enableVertexAttribArray(p);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(p,2,gl.FLOAT,false,16,0);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);gl.enable(gl.BLEND);gl.clearColor(0,0,0,0);
      const results=[];for(const anim of data){gl.bindTexture(gl.TEXTURE_2D,texes[anim.texture]);const rendered=[];for(const frame of anim.frames){gl.clear(gl.COLOR_BUFFER_BIT);for(const mesh of frame){const points=[];for(const i of mesh.triangles)points.push((mesh.vertices[i*2]-50)*1.35/320,(mesh.vertices[i*2+1]-135)*1.35/240,mesh.uvs[i*2],mesh.uvs[i*2+1]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STREAM_DRAW);gl.uniform4fv(gl.getUniformLocation(program,'color'),mesh.color);gl.blendFunc(gl.ONE,mesh.additive?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,0,points.length/4);}if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL render failed');rendered.push(canvas.toDataURL('image/png').split(',')[1]);}results.push({name:anim.name,duration:anim.duration,frames:rendered});}return results;
    },{data,textures});
    const manifest={source:'ICEY / Spine 2.1.27',animations:{}};
    for(const anim of output){const dir=path.join(root,'src/assets/animations',anim.name);fs.mkdirSync(dir,{recursive:true});anim.frames.forEach((frame,i)=>fs.writeFileSync(path.join(dir,`${String(i).padStart(3,'0')}.png`),Buffer.from(frame,'base64')));manifest.animations[anim.name]={duration:anim.duration,count:anim.frames.length};}
    fs.writeFileSync(path.join(root,'src/assets/animations/manifest.json'),JSON.stringify(manifest,null,2));console.log(manifest);
  }finally{await browser.close();}
}
build().catch(e=>{console.error(e);process.exitCode=1;});
