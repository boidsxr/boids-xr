import * as THREE from './build/three.module.js';

import Stats from './js/stats.module.js';

import { GUI } from './js/dat.gui.module.js';

import { GPUComputationRenderer } from './js/GPUComputationRenderer.js';
import { VRButton } from './js/VRButton.js';
import { XRControllerModelFactory } from './js/XRControllerModelFactory.js';



/* TEXTURE WIDTH FOR SIMULATION */
const WIDTH = 32;

const BIRDS = WIDTH * WIDTH;

// Set to false to remove boids (for debugging)
const showBoids = true;


// Custom Geometry - using 3 triangles each. No UVs, no normals currently.
function BirdGeometry() {
  const triangles = BIRDS * 3;
  const points = triangles * 3;
  THREE.BufferGeometry.call( this );
  const vertices = new THREE.BufferAttribute( new Float32Array( points * 3 ), 3 );
  const birdColors = new THREE.BufferAttribute( new Float32Array( points * 3 ), 3 );
  const references = new THREE.BufferAttribute( new Float32Array( points * 2 ), 2 );
  const birdVertex = new THREE.BufferAttribute( new Float32Array( points ), 1 );
  this.setAttribute( 'position', vertices );
  this.setAttribute( 'birdColor', birdColors );
  this.setAttribute( 'reference', references );
  this.setAttribute( 'birdVertex', birdVertex );

  // this.setAttribute( 'normal', new Float32Array( points * 3 ), 3 );
  let v = 0;
  function verts_push() {
    for ( let i = 0; i < arguments.length; i ++ ) {
      vertices.array[ v ++ ] = arguments[ i ];
    }
  }

  const wingsSpan = 20;
  for ( let f = 0; f < BIRDS; f ++ ) {
    // Body
    verts_push(
      0, - 0, - 20,
      0, 4, - 20,
      0, 0, 30
    );
    // Left Wing
    verts_push(
      0, 0, - 15,
      - wingsSpan, 0, 0,
      0, 0, 15
    );
    // Right Wing
    verts_push(
      0, 0, 15,
      wingsSpan, 0, 0,
      0, 0, - 15
    );
  }

  for ( let v = 0; v < triangles * 3; v ++ ) {
    const i = ~ ~ ( v / 3 );
    const x = ( i % WIDTH ) / WIDTH;
    const y = ~ ~ ( i / WIDTH ) / WIDTH;
    const c = new THREE.Color(
      0x444444 +
        ~ ~ ( v / 9 ) / BIRDS * 0x666666
    );

    birdColors.array[ v * 3 + 0 ] = c.r;
    birdColors.array[ v * 3 + 1 ] = c.g;
    birdColors.array[ v * 3 + 2 ] = c.b;

    references.array[ v * 2 ] = x;
    references.array[ v * 2 + 1 ] = y;

    birdVertex.array[ v ] = v % 9;
  }
  this.scale( 0.2, 0.2, 0.2 );
}

if (showBoids) {
  BirdGeometry.prototype = Object.create( THREE.BufferGeometry.prototype );
}


let container, stats;
let camera, scene, renderer;

const BOUNDS = 800, BOUNDS_HALF = BOUNDS / 2;

let last = performance.now();

let gpuCompute;
let velocityVariable;
let positionVariable;
let positionUniforms;
let velocityUniforms;
let birdUniforms;

let centerOfGravityShader;
let centerOfGravityRenderTarget;
let centerOfGravityImage;
let centerOfGravityCursor;

let cursor1, cursor2, wand1, wand2;
let controller1, controller2;

let birdsFollowLeft = false;
let birdsFollowRight = false;


let sound;

init();


//import { xrLog } from './xr-console.module.js';
/*
const formatVec = v => `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
setInterval(() => {
  const dist = camera.position.distanceToSquared(controller1.position);
  const zdist = cursor.position.z;
  const text = `${dist.toFixed(2).toString()}\n${ zdist.toFixed(2)}`;
  xrLog(text, scene);
}, 1000);
*/


animate();


// Skybox stuff
function createPathStrings(filename) {
  const basePath = "./images/";
  const baseFilename = basePath + filename;
  const fileType = ".jpg";

  // in VR view: right, left, top, bottom, back, front
  const sides = ["ft", "bk", "up", "dn", "rt", "lf"];

//  const sides = ["Right", "Left", "Top", "Bottom", "Front", "Back"];

  const pathStrings = sides.map(side => baseFilename + "_" + side + fileType);
  return pathStrings;
}


function createMaterialArray(filename) {
  const skyboxImagepaths = createPathStrings(filename);
  const materialArray = skyboxImagepaths.map(image => {
    let texture = new THREE.TextureLoader().load(image);
    return new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide }); // <---
  });
  return materialArray;
}


// init everything


function init() {
  container = document.createElement( 'div' );
  document.body.appendChild( container );

  camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, .1, 3000 );
  camera.position.z = 350;

  scene = new THREE.Scene();
  scene.background = new THREE.Color( 0x333399 );
//  scene.fog = new THREE.Fog( 0x333399, 800, 1000 );

  // const floorGeometry = new THREE.PlaneGeometry(25000, 25000, 30, 30);
  // const floorMaterialMesh = new THREE.MeshPhongMaterial({ color: 0x009922, emissive: 0x072534, side: THREE.DoubleSide, flatShading: true });
  // const floor = new THREE.Mesh( floorGeometry, floorMaterialMesh );
  // floor.rotation.x = Math.PI/2;
  // floor.position.y = -300;
  // floor.receiveShadow = true;
  // scene.add( floor );

  let skyboxImage = "afterrain";
  const materialArray = createMaterialArray(skyboxImage);
  const skyboxGeometry = new THREE.BoxGeometry(1000, 1000, 1000);
  const skybox = new THREE.Mesh(skyboxGeometry, materialArray);
  scene.add(skybox);


/*
  const spotLight = new THREE.SpotLight( 0xffffff );
  spotLight.position.set( 100, 1000, 100 );
  spotLight.shadow.camera.near = 100;
  spotLight.shadow.camera.far = 10000;
  spotLight.shadow.camera.fov = 50;
  scene.add( spotLight );
*/

  scene.add( new THREE.HemisphereLight( 0x808080, 0x606060 ) );

  const listener = new THREE.AudioListener();
  camera.add( listener );


  // debug: display center of gravity
  centerOfGravityCursor = new THREE.Mesh(
    new THREE.SphereGeometry( 1, 24, 12 ),
    new THREE.MeshPhongMaterial( { color: 0xFF0000 } )
  );
  scene.add(centerOfGravityCursor);

  renderer = new THREE.WebGLRenderer();
  renderer.xr.enabled = true;
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  container.appendChild( renderer.domElement );


  // VR Button
  document.body.appendChild(VRButton.createButton(renderer));

  const toggle1 = () => { birdsFollowRight = !birdsFollowRight; wand1.visible = !wand1.visible };
  const toggle2 = () => { birdsFollowLeft = !birdsFollowLeft; wand2.visible = !wand2.visible };


  controller1 = renderer.xr.getController( 0 );
  controller1.addEventListener('selectstart', toggle1);
  controller1.addEventListener('selectend', toggle1);
  scene.add( controller1 );

  controller2 = renderer.xr.getController( 1 );
  controller2.addEventListener('selectstart', toggle2);
  controller2.addEventListener('selectend', toggle2);
  scene.add( controller2 );

  const controllerModelFactory = new XRControllerModelFactory();

  const controllerGrip1 = renderer.xr.getControllerGrip( 0 );
  controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
  scene.add( controllerGrip1 );

  const controllerGrip2 = renderer.xr.getControllerGrip( 1 );
  controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
  scene.add( controllerGrip2 );


  const wandGeometry = new THREE.CylinderGeometry( .01, .01, 1, 32 );
  const wandMaterial = new THREE.MeshPhongMaterial({ color: 0xff6666 });
  wand1 = new THREE.Mesh( wandGeometry, wandMaterial );
  wand1.rotation.x = Math.PI/2;
  wand1.position.z = -.5;
  wand1.visible = false;
  controller1.add(wand1);
  wand2 = new THREE.Mesh( wandGeometry, wandMaterial );
  wand2.rotation.x = Math.PI/2;
  wand2.position.z = -.5;
  wand2.visible = false;
  controller2.add(wand2);

  const cursorGeometry = new THREE.SphereGeometry(.1, 8, 8);
  const cursorMaterial = new THREE.MeshPhongMaterial({ color: 0x00ffff });
  cursor1 = new THREE.Mesh(cursorGeometry, cursorMaterial);
  cursor1.position.set(0,0,-5);
  cursor1.visible = false;
  controller1.add(cursor1);
  cursor2 = new THREE.Mesh(cursorGeometry, cursorMaterial);
  cursor2.position.set(0,0,-5);
  cursor2.visible = false;
  controller2.add(cursor2);


  // end VR stuff

  if (showBoids) {
    initComputeRenderer();
  }

  stats = new Stats();
  container.appendChild( stats.dom );
  container.style.touchAction = 'none';


  window.addEventListener( 'resize', onWindowResize );

  let gui;
  let effectController;
  if (showBoids) {
    gui = new GUI();

    effectController = {
      separation: 20.0,
      alignment: 20.0,
      cohesion: 20.0,
      freedom: 0.75
    };

    const valuesChanger = function () {
      velocityUniforms[ 'separationDistance' ].value = effectController.separation;
      velocityUniforms[ 'alignmentDistance' ].value = effectController.alignment;
      velocityUniforms[ 'cohesionDistance' ].value = effectController.cohesion;
      velocityUniforms[ 'freedomFactor' ].value = effectController.freedom;
    };

    valuesChanger();

    gui.add( effectController, 'separation', 0.0, 100.0, 1.0 ).onChange( valuesChanger );
    gui.add( effectController, 'alignment', 0.0, 100, 0.001 ).onChange( valuesChanger );
    gui.add( effectController, 'cohesion', 0.0, 100, 0.025 ).onChange( valuesChanger );
    gui.close();

  // create the PositionalAudio object (passing in the listener)
  sound = new THREE.PositionalAudio( listener );

  // load a sound and set it as the PositionalAudio object's buffer
  const audioLoader = new THREE.AudioLoader();



  audioLoader.load( 'pinknoise.mp3', function( buffer ) {
    sound.setBuffer( buffer );
    sound.loop = true;
    sound.setRefDistance( 100 );
    sound.play();
  });

  // const button = document.getElementById('VRButton') || document;
  // button.addEventListener('click', function() {
  //   if (sound.paused) {
  //     console.log('play');
  //     sound.play();
  //   } else {
  //     sound.pause();
  //     console.log('pause');
  //   }
  // });


    initBirds();
  }




  // Audio stuff
  // audio = new Audio("pinknoise.mp3");
  // audio.loop = true;
  // const button = document.getElementById('VRButton') || document;
  // button.addEventListener('click', function() {
  //   if (audio.paused) {
  //     audio.play();
  //   } else {
  //     audio.pause();
  //   }
  // });
}


function initComputeRenderer() {
  gpuCompute = new GPUComputationRenderer( WIDTH, WIDTH, renderer );
  if ( isSafari() ) {
    gpuCompute.setDataType( THREE.HalfFloatType );
  }
  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  fillPositionTexture( dtPosition );
  fillVelocityTexture( dtVelocity );

  velocityVariable = gpuCompute.addVariable( 'textureVelocity', document.getElementById( 'fragmentShaderVelocity' ).textContent, dtVelocity );
  positionVariable = gpuCompute.addVariable( 'texturePosition', document.getElementById( 'fragmentShaderPosition' ).textContent, dtPosition );

  gpuCompute.setVariableDependencies( velocityVariable, [positionVariable, velocityVariable] );
  gpuCompute.setVariableDependencies( positionVariable, [positionVariable, velocityVariable] );

  positionUniforms = positionVariable.material.uniforms;
  velocityUniforms = velocityVariable.material.uniforms;

  positionUniforms[ 'time' ] = { value: 0.0 };
  positionUniforms[ 'delta' ] = { value: 0.0 };
  velocityUniforms[ 'time' ] = { value: 1.0 };
  velocityUniforms[ 'delta' ] = { value: 0.0 };
  velocityUniforms[ 'testing' ] = { value: 1.0 };
  velocityUniforms[ 'separationDistance' ] = { value: 1.0 };
  velocityUniforms[ 'alignmentDistance' ] = { value: 1.0 };
  velocityUniforms[ 'cohesionDistance' ] = { value: 1.0 };
  velocityUniforms[ 'freedomFactor' ] = { value: 1.0 };
  velocityUniforms[ 'predator1' ] = { value: new THREE.Vector3(0, 100, -300) };
  velocityUniforms[ 'predator2' ] = { value: new THREE.Vector3(0, 100, -300) };
  velocityVariable.material.defines.BOUNDS = BOUNDS.toFixed( 2 );

  velocityVariable.wrapS = THREE.RepeatWrapping;
  velocityVariable.wrapT = THREE.RepeatWrapping;
  positionVariable.wrapS = THREE.RepeatWrapping;
  positionVariable.wrapT = THREE.RepeatWrapping;

  const error = gpuCompute.init();

  if ( error !== null ) {
    console.error( error );
  }

  // Create compute shader to read water level
  centerOfGravityShader = gpuCompute.createShaderMaterial( document.getElementById( 'centerOfGravityFragmentShader' ).textContent, {
    levelTexture: { value: null }
  } );
  centerOfGravityShader.defines.WIDTH = WIDTH.toFixed( 1 );
  centerOfGravityShader.defines.BOUNDS = BOUNDS.toFixed( 1 );

  // Create a 4x1 pixel image and a render target (Uint8, 4 channels, 1 byte per channel) to read water height and orientation
  centerOfGravityImage = new Uint8Array( 4 * 1 * 4 );

  centerOfGravityRenderTarget = new THREE.WebGLRenderTarget( 4, 1, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false
  } );



}

function isSafari() {
  return !! navigator.userAgent.match( /Safari/i ) && ! navigator.userAgent.match( /Chrome/i );
}

function initBirds() {

  const geometry = new BirdGeometry();

  // For Vertex and Fragment
  birdUniforms = {
    'color': { value: new THREE.Color( 0xff2200 ) },
    'texturePosition': { value: null },
    'textureVelocity': { value: null },
    'time': { value: 1.0 },
    'delta': { value: 0.0 }
  };

  // THREE.ShaderMaterial
  const material = new THREE.ShaderMaterial( {
    uniforms: birdUniforms,
    vertexShader: document.getElementById( 'birdVS' ).textContent,
    fragmentShader: document.getElementById( 'birdFS' ).textContent,
    side: THREE.DoubleSide
  } );

  const birdMesh = new THREE.Mesh( geometry, material );
  birdMesh.rotation.y = Math.PI / 2;
  birdMesh.matrixAutoUpdate = false;
  birdMesh.updateMatrix();

  scene.add( birdMesh );
//  birdMesh.add(sound);
  centerOfGravityCursor.add(sound);
}

function fillPositionTexture( texture ) {
  const theArray = texture.image.data;
  for ( let k = 0, kl = theArray.length; k < kl; k += 4 ) {
    const x = Math.random() * BOUNDS/4;
    const y = Math.random() * BOUNDS/4;
    const z = Math.random() * BOUNDS/8 - BOUNDS/2;
    theArray[ k + 0 ] = x;
    theArray[ k + 1 ] = y;
    theArray[ k + 2 ] = z;
    theArray[ k + 3 ] = 1;
  }
}

function fillVelocityTexture( texture ) {
  const theArray = texture.image.data;
  for ( let k = 0, kl = theArray.length; k < kl; k += 4 ) {
    const x = Math.random() - 0.5;
    const y = Math.random() - 0.5;
    const z = Math.random() - 0.5;
    theArray[ k + 0 ] = x * 10;
    theArray[ k + 1 ] = y * 10;
    theArray[ k + 2 ] = z * 10;
    theArray[ k + 3 ] = 1;
  }
}


function centerOfGravity() {

  // push the current position texture to centerOfGravityFragmentShader
  const currentRenderTarget = gpuCompute.getCurrentRenderTarget(positionVariable);
  centerOfGravityShader.uniforms[ 'levelTexture' ].value = currentRenderTarget.texture;


  // run the shader
  gpuCompute.doRenderTarget( centerOfGravityShader, centerOfGravityRenderTarget );


  // retrieve the results
  renderer.readRenderTargetPixels(
    centerOfGravityRenderTarget,
    0, 0, 4, 1, // x, y, width, height
    centerOfGravityImage );
  const pixels = new Float32Array( centerOfGravityImage.buffer );

  return new THREE.Vector3(pixels[0], pixels[1], pixels[2]);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

function animate() {
  render();
  stats.update();
}

renderer.setAnimationLoop(animate);


function render() {
  const now = performance.now();

  // update cursors and wands depending on controller positions
  const dist1 = camera.position.distanceToSquared(controller1.position);
  const dist2 = camera.position.distanceToSquared(controller2.position);

  cursor1.position.z = dist1 < 0.2 ? 0 : -300;
  cursor2.position.z = dist2 < 0.2 ? 0 : -300;

//  wand1.scale.z = -cursor1.position.z;
//  wand2.scale.z = -cursor2.position.z;

  if (showBoids) {
    let delta = ( now - last ) / 1000;
    const cwp1 = new THREE.Vector3(0,0,0);
    const cwp2 = new THREE.Vector3(0,0,0);

    if ( delta > 1 ) delta = 1; // safety cap on large deltas
    last = now;

    positionUniforms[ 'time' ].value = now;
    positionUniforms[ 'delta' ].value = delta;
    velocityUniforms[ 'time' ].value = now;
    velocityUniforms[ 'delta' ].value = delta;

    birdUniforms[ 'time' ].value = now;
    birdUniforms[ 'delta' ].value = delta;

    cursor1.getWorldPosition(cwp1);
    cursor2.getWorldPosition(cwp2);

    if (birdsFollowLeft) {
      if (birdsFollowRight) {
        velocityUniforms[ 'predator1' ].value.set(cwp2.x, cwp2.y, cwp2.z);
        velocityUniforms[ 'predator2' ].value.set(cwp1.x, cwp1.y, cwp1.z);
      } else {
        velocityUniforms[ 'predator1' ].value.set(cwp2.x, cwp2.y, cwp2.z);
        velocityUniforms[ 'predator2' ].value.set(cwp2.x, cwp2.y, cwp2.z);
      }
    } else {
      if (birdsFollowRight) {
        velocityUniforms[ 'predator1' ].value.set(cwp1.x, cwp1.y, cwp1.z);
        velocityUniforms[ 'predator2' ].value.set(cwp1.x, cwp1.y, cwp1.z);
      } else {
        velocityUniforms[ 'predator1' ].value.set(0, -100, -300);
        velocityUniforms[ 'predator2' ].value.set(0, -100, -300);
      }
    }

    renderer.xr.enabled = false;
    gpuCompute.compute();
    birdUniforms[ 'texturePosition' ].value =
      gpuCompute.getCurrentRenderTarget( positionVariable ).texture;
    birdUniforms[ 'textureVelocity' ].value =
      gpuCompute.getCurrentRenderTarget( velocityVariable ).texture;
    renderer.xr.enabled = true;

    const cog = centerOfGravity();
    centerOfGravityCursor.position.x = cog.x;
    centerOfGravityCursor.position.y = cog.y;
    centerOfGravityCursor.position.z = cog.z;

//    const dist = 1 / (1 + (cog.x*cog.x + cog.y*cog.y + cog.z*cog.z)/50000);

//    audio.volume = dist;
  }
  renderer.render( scene, camera );
}
