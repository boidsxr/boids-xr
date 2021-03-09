import * as THREE from './build/three.module.js';

import Stats from './js/stats.module.js';

import { GUI } from './js/dat.gui.module.js';

import { GPUComputationRenderer } from './js/GPUComputationRenderer.js';
import { VRButton } from './js/VRButton.js';
import { XRControllerModelFactory } from './js/XRControllerModelFactory.js';


import { xrLog } from './xr-console.module.js';

/* TEXTURE WIDTH FOR SIMULATION */
const WIDTH = 32;

const BIRDS = WIDTH * WIDTH;

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
//let mouseX = 0, mouseY = 0;

//let windowHalfX = window.innerWidth / 2;
//let windowHalfY = window.innerHeight / 2;

const BOUNDS = 800, BOUNDS_HALF = BOUNDS / 2;

let last = performance.now();

let gpuCompute;
let velocityVariable;
let positionVariable;
let positionUniforms;
let velocityUniforms;
let birdUniforms;

let font, cursor, wandGeometry;

let controller1, controller2;
let ctl1InitialPos = null;

init();
setInterval(() => {
  const text = `${cursor.position.x.toFixed(2)},
${cursor.position.y.toFixed(2)},
${cursor.position.z.toFixed(2)}`;
  xrLog(text, font, scene);
}, 1000);
animate();



function setWand(p1, p2) {
  wandGeometry.attributes.position.setXYZ(0, p1.x, p1.y, p1.z);
  wandGeometry.attributes.position.setXYZ(1, p2.x, p2.y, p2.z);
  wandGeometry.attributes.position.needsUpdate = true;
}



function init() {
  container = document.createElement( 'div' );
  document.body.appendChild( container );

  camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, .1, 3000 );
  camera.position.z = 350;

  scene = new THREE.Scene();
  scene.background = new THREE.Color( 0xffffff );
  //                                scene.fog = new THREE.Fog( 0xffffff, 100, 1000 );


  const floorGeometry = new THREE.BoxGeometry(2500, 10, 2500, 30, 1, 30);
  const floorMaterial = new THREE.MeshPhongMaterial( { color: 0x00FF00 } );
  const floor = new THREE.Mesh( floorGeometry, floorMaterial );
  floor.position.y = -300;
  floor.receiveShadow = true;
  scene.add( floor );

  // box-cursor
  const cursorGeometry = new THREE.SphereGeometry(.1, 8, 8);
  const cursorMaterial = new THREE.MeshPhongMaterial({ color: 0x00ffff });
  cursor = new THREE.Mesh(cursorGeometry, cursorMaterial);
  scene.add(cursor);

  // ==== text
  const loader = new THREE.FontLoader();
  loader.load('optimer_bold.typeface.json', response => {
    font = response;
  });


  // magic wand
  const wandMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
  const wandPoints = [];
  wandPoints.push( new THREE.Vector3( - 10, 0, 0 ) );
  wandPoints.push( new THREE.Vector3( 10, 0, 0 ) );
  wandGeometry = new THREE.BufferGeometry().setFromPoints( wandPoints );
  const wand = new THREE.Line( wandGeometry, wandMaterial );
  scene.add(wand);

  const spotLight = new THREE.SpotLight( 0xffffff );
  spotLight.position.set( 100, 1000, 100 );
  spotLight.shadow.camera.near = 100;
  spotLight.shadow.camera.far = 10000;
  spotLight.shadow.camera.fov = 50;

  scene.add( spotLight );

  scene.add( new THREE.HemisphereLight( 0x808080, 0x606060 ) );

  renderer = new THREE.WebGLRenderer();
  renderer.xr.enabled = true;
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  container.appendChild( renderer.domElement );


  // VR Button
  document.body.appendChild(VRButton.createButton(renderer));

  // VR controllers

  controller1 = renderer.xr.getController( 0 );
  //       controller1.addEventListener( 'selectstart', onSelectStart );
  //       controller1.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller1 );

  controller2 = renderer.xr.getController( 1 );
  //       controller2.addEventListener( 'selectstart', onSelectStart );
  //       controller2.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller2 );

  const controllerModelFactory = new XRControllerModelFactory();

  const controllerGrip1 = renderer.xr.getControllerGrip( 0 );
  controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
  scene.add( controllerGrip1 );

  const controllerGrip2 = renderer.xr.getControllerGrip( 1 );
  controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
  scene.add( controllerGrip2 );


  // end VR stuff

  if (showBoids) {
    initComputeRenderer();
  }

  stats = new Stats();
  container.appendChild( stats.dom );

  container.style.touchAction = 'none';

//  if (showBoids) {
//    container.addEventListener( 'pointermove', onPointerMove );
//  }

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

    initBirds();
  }
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
  velocityUniforms[ 'predator' ] = { value: new THREE.Vector3() };
  velocityVariable.material.defines.BOUNDS = BOUNDS.toFixed( 2 );

  velocityVariable.wrapS = THREE.RepeatWrapping;
  velocityVariable.wrapT = THREE.RepeatWrapping;
  positionVariable.wrapS = THREE.RepeatWrapping;
  positionVariable.wrapT = THREE.RepeatWrapping;

  const error = gpuCompute.init();

  if ( error !== null ) {
    console.error( error );
  }
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
}

function fillPositionTexture( texture ) {
  const theArray = texture.image.data;
  for ( let k = 0, kl = theArray.length; k < kl; k += 4 ) {
    const x = Math.random() * BOUNDS - BOUNDS_HALF;
    const y = Math.random() * BOUNDS - BOUNDS_HALF;
    const z = Math.random() * BOUNDS - BOUNDS_HALF;
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

function onWindowResize() {
//  windowHalfX = window.innerWidth / 2;
//  windowHalfY = window.innerHeight / 2;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

//function onPointerMove( event ) {
//  if ( event.isPrimary === false ) return;
//  mouseX = event.clientX - windowHalfX;
//  mouseY = event.clientY - windowHalfY;
//}


function animate() {
  render();
  stats.update();
}

renderer.setAnimationLoop(animate);

const ctlMul = 10;

function render() {
  const now = performance.now();


  if (!ctl1InitialPos &&
      controller1.position.x !== 0.0 &&
      controller1.position.y !== 0.0 &&
      controller1.position.z !== 0.0) {
    ctl1InitialPos = controller1.position.clone();
  }


  if (ctl1InitialPos) {
    cursor.position.x =
      (1 - ctlMul) * ctl1InitialPos.x + ctlMul * controller1.position.x;
    cursor.position.y =
      (1 - ctlMul) * ctl1InitialPos.y + ctlMul * controller1.position.y;
    cursor.position.z =
      (1 - ctlMul) * ctl1InitialPos.z + ctlMul * controller1.position.z;

    setWand(controller1.position, cursor.position);


  }


  if (showBoids) {
    let delta = ( now - last ) / 1000;

    if ( delta > 1 ) delta = 1; // safety cap on large deltas
    last = now;


    positionUniforms[ 'time' ].value = now;
    positionUniforms[ 'delta' ].value = delta;
    velocityUniforms[ 'time' ].value = now;
    velocityUniforms[ 'delta' ].value = delta;

    birdUniforms[ 'time' ].value = now;
    birdUniforms[ 'delta' ].value = delta;

//    velocityUniforms[ 'predator' ].value.set( 0.5 * mouseX / windowHalfX, - 0.5 * mouseY / windowHalfY, 0 );

//    console.log(23, velocityUniforms['predator'].value);


    // should be within a cube with bounds [-.5, .5] */
    velocityUniforms[ 'predator' ].value.set(
      cursor.position.x/4,
      (cursor.position.y-1.6)/4,
      cursor.position.z/4
    );


//    mouseX = 10000;
//    mouseY = 10000;

    renderer.xr.enabled = false;
    gpuCompute.compute();
    birdUniforms[ 'texturePosition' ].value =
      gpuCompute.getCurrentRenderTarget( positionVariable ).texture;
    birdUniforms[ 'textureVelocity' ].value =
      gpuCompute.getCurrentRenderTarget( velocityVariable ).texture;
    renderer.xr.enabled = true;
  }
  renderer.render( scene, camera );
}
