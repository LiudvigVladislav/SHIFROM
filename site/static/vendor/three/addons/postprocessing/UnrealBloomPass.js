import{AdditiveBlending as M,Color as T,HalfFloatType as p,MeshBasicMaterial as S,ShaderMaterial as c,UniformsUtils as x,Vector2 as n,Vector3 as m,WebGLRenderTarget as v}from"three";import{Pass as C,FullScreenQuad as _}from"./Pass.js?v=9c1a4327";import{CopyShader as b}from"../shaders/CopyShader.js?v=41d281b4";import{LuminosityHighPassShader as B}from"../shaders/LuminosityHighPassShader.js?v=c7816aae";class h extends C{constructor(e,o=1,i,a){super(),this.strength=o,this.radius=i,this.threshold=a,this.resolution=e!==void 0?new n(e.x,e.y):new n(256,256),this.clearColor=new T(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let r=Math.round(this.resolution.x/2),t=Math.round(this.resolution.y/2);this.renderTargetBright=new v(r,t,{type:p,depthBuffer:!1}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let u=0;u<this.nMips;u++){const d=new v(r,t,{type:p,depthBuffer:!1});d.texture.name="UnrealBloomPass.h"+u,d.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(d);const g=new v(r,t,{type:p,depthBuffer:!1});g.texture.name="UnrealBloomPass.v"+u,g.texture.generateMipmaps=!1,this.renderTargetsVertical.push(g),r=Math.round(r/2),t=Math.round(t/2)}const l=B;this.highPassUniforms=x.clone(l.uniforms),this.highPassUniforms.luminosityThreshold.value=a,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new c({uniforms:this.highPassUniforms,vertexShader:l.vertexShader,fragmentShader:l.fragmentShader}),this.separableBlurMaterials=[];const s=[6,10,14,18,22];r=Math.round(this.resolution.x/2),t=Math.round(this.resolution.y/2);for(let u=0;u<this.nMips;u++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[u])),this.separableBlurMaterials[u].uniforms.invSize.value=new n(1/r,1/t),r=Math.round(r/2),t=Math.round(t/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=o,this.compositeMaterial.uniforms.bloomRadius.value=.1;const f=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=f,this.bloomTintColors=[new m(1,1,1),new m(1,1,1),new m(1,1,1),new m(1,1,1),new m(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=x.clone(b.uniforms),this.blendMaterial=new c({uniforms:this.copyUniforms,vertexShader:b.vertexShader,fragmentShader:b.fragmentShader,premultipliedAlpha:!0,blending:M,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new T,this._oldClearAlpha=1,this._basic=new S,this._fsQuad=new _(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,o){let i=Math.round(e/2),a=Math.round(o/2);this.renderTargetBright.setSize(i,a);for(let r=0;r<this.nMips;r++)this.renderTargetsHorizontal[r].setSize(i,a),this.renderTargetsVertical[r].setSize(i,a),this.separableBlurMaterials[r].uniforms.invSize.value=new n(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2)}render(e,o,i,a,r){e.getClearColor(this._oldClearColor),this._oldClearAlpha=e.getClearAlpha();const t=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),r&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=i.texture,e.setRenderTarget(null),e.clear(),this._fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=i.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this._fsQuad.render(e);let l=this.renderTargetBright;for(let s=0;s<this.nMips;s++)this._fsQuad.material=this.separableBlurMaterials[s],this.separableBlurMaterials[s].uniforms.colorTexture.value=l.texture,this.separableBlurMaterials[s].uniforms.direction.value=h.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[s]),e.clear(),this._fsQuad.render(e),this.separableBlurMaterials[s].uniforms.colorTexture.value=this.renderTargetsHorizontal[s].texture,this.separableBlurMaterials[s].uniforms.direction.value=h.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[s]),e.clear(),this._fsQuad.render(e),l=this.renderTargetsVertical[s];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this._fsQuad.render(e),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,r&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(i),this._fsQuad.render(e)),e.setClearColor(this._oldClearColor,this._oldClearAlpha),e.autoClear=t}_getSeparableBlurMaterial(e){const o=[],i=e/3;for(let t=0;t<e;t++)o.push(.39894*Math.exp(-.5*t*t/(i*i))/i);const a=[],r=[];for(let t=1;t<e;t+=2){const l=o[t],s=t+1<e?o[t+1]:0,f=l+s;a.push((t*l+(t+1)*s)/f),r.push(f)}return new c({defines:{KERNEL_PAIRS:a.length},uniforms:{colorTexture:{value:null},invSize:{value:new n(.5,.5)},direction:{value:new n(.5,.5)},centerWeight:{value:o[0]},gaussianOffsets:{value:a},gaussianWeights:{value:r}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new c({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}}h.BlurDirectionX=new n(1,0),h.BlurDirectionY=new n(0,1);export{h as UnrealBloomPass};
