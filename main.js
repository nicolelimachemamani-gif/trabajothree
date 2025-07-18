import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 25, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 15, 0);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 30, 10);
dirLight.castShadow = true;
scene.add(dirLight);

const sueloTexture = new THREE.TextureLoader().load('suelo.jpg');
sueloTexture.wrapS = THREE.RepeatWrapping;
sueloTexture.wrapT = THREE.RepeatWrapping;
sueloTexture.repeat.set(30, 30);

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ map: sueloTexture })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const peceraMaterial = new THREE.MeshBasicMaterial({
    color: 0x0099ff,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide
});

const wallGeometry = new THREE.PlaneGeometry(80, 35);
const leftWall = new THREE.Mesh(wallGeometry, peceraMaterial);
leftWall.position.set(-40, 17.5, 0);
leftWall.rotation.y = Math.PI / 2;
scene.add(leftWall);

const rightWall = new THREE.Mesh(wallGeometry, peceraMaterial);
rightWall.position.set(40, 17.5, 0);
rightWall.rotation.y = -Math.PI / 2;
scene.add(rightWall);

const frontWall = new THREE.Mesh(wallGeometry, peceraMaterial);
frontWall.position.set(0, 17.5, 40);
scene.add(frontWall);

const backWall = new THREE.Mesh(wallGeometry, peceraMaterial);
backWall.position.set(0, 17.5, -40);
scene.add(backWall);

const topGeometry = new THREE.PlaneGeometry(80, 80);
const topWall = new THREE.Mesh(topGeometry, peceraMaterial);
topWall.position.set(0, 35, 0);
topWall.rotation.x = Math.PI / 2;
scene.add(topWall);

const loader = new GLTFLoader();
const clock = new THREE.Clock();

const peces = [];
let NUM_PECES = 12;

const LIMIT_X = 35;
const LIMIT_Y_MIN = 3;
const LIMIT_Y_MAX = 32;
const LIMIT_Z = 35;

let RADIO_SEPARACION = 8;
let RADIO_ALINEACION = 15;
let RADIO_COHESION = 20;

// Vincular sliders a parámetros
const numPecesSlider = document.getElementById('numPeces');
const separacionSlider = document.getElementById('separacion');
const alineacionSlider = document.getElementById('alineacion');
const cohesionSlider = document.getElementById('cohesion');

const numPecesValue = document.getElementById('numPecesValue');
const separacionValue = document.getElementById('separacionValue');
const alineacionValue = document.getElementById('alineacionValue');
const cohesionValue = document.getElementById('cohesionValue');

// Event listeners para los sliders
numPecesSlider.addEventListener('input', (e) => {
    const nuevoNumPeces = parseInt(e.target.value);
    numPecesValue.textContent = nuevoNumPeces;
    actualizarNumeroPeces(nuevoNumPeces);
});

separacionSlider.addEventListener('input', (e) => {
    RADIO_SEPARACION = parseFloat(e.target.value);
    separacionValue.textContent = RADIO_SEPARACION;
});

alineacionSlider.addEventListener('input', (e) => {
    RADIO_ALINEACION = parseFloat(e.target.value);
    alineacionValue.textContent = RADIO_ALINEACION;
});

cohesionSlider.addEventListener('input', (e) => {
    RADIO_COHESION = parseFloat(e.target.value);
    cohesionValue.textContent = RADIO_COHESION;
});

const FUERZA_SEPARACION = 1.5;
const FUERZA_ALINEACION = 0.8;
const FUERZA_COHESION = 0.5;
const FUERZA_PARED = 3.0;
const VELOCIDAD_MAX = 6;
const VELOCIDAD_MIN = 2;

let modelForwardOffset = 0;
let modelUpOffset = 0;

const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === '1') modelForwardOffset += Math.PI / 4;
    if (e.key === '2') modelForwardOffset -= Math.PI / 4;
    if (e.key === '3') modelUpOffset += Math.PI / 4;
    if (e.key === '4') modelUpOffset -= Math.PI / 4;
    if (e.key === '0') {
        modelForwardOffset = 0;
        modelUpOffset = 0;
    }
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

const debugInfo = document.getElementById('debugInfo');

// Clase para cada pez
class Pez {
    constructor(model, mixer) {
        this.model = model;
        this.mixer = mixer;
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 4
        );
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.maxSpeed = VELOCIDAD_MAX;
        this.maxForce = 0.5;

        // Comportamiento natural de nado
        this.wiggleOffset = Math.random() * Math.PI * 2;
        this.wiggleSpeed = 0.5 + Math.random() * 0.5;
        this.baseY = model.position.y;
    }

    update(delta, peces) {
        // Resetear aceleración
        this.acceleration.set(0, 0, 0);

        // Aplicar reglas de boids
        const sep = this.separate(peces);
        const ali = this.align(peces);
        const coh = this.cohesion(peces);
        const avoid = this.avoidWalls();
        const swim = this.naturalSwimming();

        // Aplicar fuerzas con diferentes pesos
        sep.multiplyScalar(FUERZA_SEPARACION);
        ali.multiplyScalar(FUERZA_ALINEACION);
        coh.multiplyScalar(FUERZA_COHESION);
        avoid.multiplyScalar(FUERZA_PARED);

        this.acceleration.add(sep).add(ali).add(coh).add(avoid).add(swim);

        // Actualizar velocidad y posición
        this.velocity.add(this.acceleration.clone().multiplyScalar(delta));
        this.velocity.clampLength(VELOCIDAD_MIN, this.maxSpeed);

        this.model.position.add(this.velocity.clone().multiplyScalar(delta));

        // Aplicar límites duros
        this.model.position.clamp(
            new THREE.Vector3(-LIMIT_X, LIMIT_Y_MIN, -LIMIT_Z),
            new THREE.Vector3(LIMIT_X, LIMIT_Y_MAX, LIMIT_Z)
        );

        // Orientar el pez hacia donde se mueve
        this.orient();

        // Actualizar animación
        if (this.mixer) this.mixer.update(delta);
    }

    separate(peces) {
        const steering = new THREE.Vector3();
        let count = 0;

        for (let other of peces) {
            if (other === this) continue;

            const distance = this.model.position.distanceTo(other.model.position);
            if (distance > 0 && distance < RADIO_SEPARACION) {
                const diff = this.model.position.clone()
                    .sub(other.model.position)
                    .normalize()
                    .divideScalar(distance); // Peso por distancia
                steering.add(diff);
                count++;
            }
        }

        if (count > 0) {
            steering.divideScalar(count).normalize().multiplyScalar(this.maxSpeed);
            steering.sub(this.velocity).clampLength(0, this.maxForce);
        }

        return steering;
    }

    align(peces) {
        const steering = new THREE.Vector3();
        let count = 0;

        for (let other of peces) {
            if (other === this) continue;

            const distance = this.model.position.distanceTo(other.model.position);
            if (distance > 0 && distance < RADIO_ALINEACION) {
                steering.add(other.velocity);
                count++;
            }
        }

        if (count > 0) {
            steering.divideScalar(count).normalize().multiplyScalar(this.maxSpeed);
            steering.sub(this.velocity).clampLength(0, this.maxForce);
        }

        return steering;
    }

    cohesion(peces) {
        const steering = new THREE.Vector3();
        let count = 0;

        for (let other of peces) {
            if (other === this) continue;

            const distance = this.model.position.distanceTo(other.model.position);
            if (distance > 0 && distance < RADIO_COHESION) {
                steering.add(other.model.position);
                count++;
            }
        }

        if (count > 0) {
            steering.divideScalar(count);
            steering.sub(this.model.position).normalize().multiplyScalar(this.maxSpeed);
            steering.sub(this.velocity).clampLength(0, this.maxForce);
        }

        return steering;
    }

    avoidWalls() {
        const steering = new THREE.Vector3();
        const pos = this.model.position;
        const wallDistance = 8;

        // Paredes X
        if (pos.x > LIMIT_X - wallDistance) {
            steering.x = -((pos.x - (LIMIT_X - wallDistance)) / wallDistance) * 2;
        }
        if (pos.x < -LIMIT_X + wallDistance) {
            steering.x = -(pos.x - (-LIMIT_X + wallDistance)) / wallDistance * 2;
        }

        // Paredes Y
        if (pos.y > LIMIT_Y_MAX - wallDistance) {
            steering.y = -((pos.y - (LIMIT_Y_MAX - wallDistance)) / wallDistance) * 2;
        }
        if (pos.y < LIMIT_Y_MIN + wallDistance) {
            steering.y = -(pos.y - (LIMIT_Y_MIN + wallDistance)) / wallDistance * 2;
        }

        // Paredes Z
        if (pos.z > LIMIT_Z - wallDistance) {
            steering.z = -((pos.z - (LIMIT_Z - wallDistance)) / wallDistance) * 2;
        }
        if (pos.z < -LIMIT_Z + wallDistance) {
            steering.z = -(pos.z - (-LIMIT_Z + wallDistance)) / wallDistance * 2;
        }

        return steering;
    }

    naturalSwimming() {
        const time = Date.now() * 0.001;
        const swimming = new THREE.Vector3();

        // Movimiento ondulatorio sutil
        swimming.y = Math.sin(time * this.wiggleSpeed + this.wiggleOffset) * 0.3;

        // Exploración aleatoria ocasional
        if (Math.random() < 0.01) {
            swimming.add(new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 1,
                (Math.random() - 0.5) * 2
            ));
        }

        return swimming;
    }

    orient() {
        if (this.velocity.length() > 0.1) {
            const targetDirection = this.velocity.clone().normalize();

            // Calcular ángulos de rotación
            const yaw = Math.atan2(targetDirection.x, targetDirection.z);
            const pitch = Math.asin(-targetDirection.y); // Negativo para orientación correcta

            // Aplicar rotación con offset del modelo
            this.model.rotation.y = yaw + modelForwardOffset + Math.PI;
            this.model.rotation.x = pitch + modelUpOffset;
        }
    }
}

// Generar posiciones iniciales distribuidas
function generarPosicionesIniciales(cantidad) {
    const posiciones = [];
    for (let i = 0; i < cantidad; i++) {
        posiciones.push(new THREE.Vector3(
            (Math.random() - 0.5) * 60,
            LIMIT_Y_MIN + Math.random() * (LIMIT_Y_MAX - LIMIT_Y_MIN),
            (Math.random() - 0.5) * 60
        ));
    }
    return posiciones;
}

// Función para crear un nuevo pez
function crearPez(posicion) {
    loader.load('pez.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.set(0.01, 0.01, 0.01);
        model.position.copy(posicion);

        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(model);

        const mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach(clip => mixer.clipAction(clip).play());

        const pez = new Pez(model, mixer);
        peces.push(pez);
    });
}

// Función para actualizar el número de peces
function actualizarNumeroPeces(nuevoNumero) {
    const diferencia = nuevoNumero - peces.length;

    if (diferencia > 0) {
        // Agregar peces
        const nuevasPosiciones = generarPosicionesIniciales(diferencia);
        for (let i = 0; i < diferencia; i++) {
            crearPez(nuevasPosiciones[i]);
        }
    } else if (diferencia < 0) {
        // Quitar peces
        const pecesAEliminar = peces.splice(diferencia); // Toma los últimos elementos
        pecesAEliminar.forEach(pez => {
            scene.remove(pez.model);
        });
    }

    NUM_PECES = nuevoNumero;
}

// Cargar peces iniciales
const posicionesIniciales = generarPosicionesIniciales(NUM_PECES);
for (let i = 0; i < NUM_PECES; i++) {
    crearPez(posicionesIniciales[i]);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Actualizar todos los peces
    for (let pez of peces) {
        pez.update(delta, peces);
    }

    // Actualizar debug info
    if (peces.length > 0) {
        const velocidadPromedio = peces.reduce((sum, pez) => sum + pez.velocity.length(), 0) / peces.length;

        debugInfo.innerHTML = `
            Simulación de Cardumen 3D<br>
            Peces: ${peces.length}/${NUM_PECES}<br>
            Velocidad promedio: ${velocidadPromedio.toFixed(2)}<br>
            Ajustar orientación: 1/2=rotar Y, 3/4=rotar X, 0=reset<br>
            Offset modelo: Y=${(modelForwardOffset * 180 / Math.PI).toFixed(1)}°, X=${(modelUpOffset * 180 / Math.PI).toFixed(1)}°<br>
            <br>
            Parámetros Boids:<br>
            Separación: ${RADIO_SEPARACION}u<br>
            Alineación: ${RADIO_ALINEACION}u<br>
            Cohesión: ${RADIO_COHESION}u
        `;
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});