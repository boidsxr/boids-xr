import * as THREE from './build/three.module.js';


let textMesh1;

function xrLog(text, font, scene) {
  if (textMesh1) scene.remove(textMesh1);
  const textGeo = new THREE.TextGeometry(
    text,
    {
      font,
      size: 10,
      height: 3,
    }
  );
  textGeo.computeBoundingBox();
  const textMaterials = [
    new THREE.MeshPhongMaterial( { color: 0xffffff, flatShading: true } ), // front
    new THREE.MeshPhongMaterial( { color: 0xffffff } ) // side
  ];
  textMesh1 = new THREE.Mesh( textGeo, textMaterials );
  const centerOffset = - 0.5 * ( textGeo.boundingBox.max.x - textGeo.boundingBox.min.x );
  textMesh1.position.x = centerOffset;
  textMesh1.position.y = 30;
  textMesh1.position.z = -100;
  textMesh1.rotation.x = 0;
  textMesh1.rotation.y = Math.PI * 2;
  scene.add(textMesh1);
}

export { xrLog };
