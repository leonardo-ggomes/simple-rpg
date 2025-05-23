import { BufferGeometry, Clock, DirectionalLight, DirectionalLightHelper, MathUtils, Mesh, PlaneGeometry, Quaternion, Raycaster, Vector2, Vector3 } from "three"
import Camera from "./Camera"
import MainScene from "./MainScene"
import Renderer from "./Renderer"
import Player from "./Player"
import Loader from "./Loader"
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh"
import Stats from "three/examples/jsm/libs/stats.module.js"
import NPC from "./NPC"
import NPCManager from "./NPCManager"


BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast

class Experience {

    camera: Camera
    mainScene: MainScene
    renderer: Renderer
    clock: Clock
    player: Player
    loader: Loader
    collisionMeshes: Mesh[] = []
    raycaster = new Raycaster()
    down = new Vector3(0, -1, 0)
    keysPressed = new Set<string>()
    velocityY = 0
    gravity = -9.81
    playerDirection = new Vector3()
    quaternion = new Quaternion()
    playerImpulse = new Vector3()
    velocity = 1.4;
    hit = false
    npcManager: NPCManager

    stats = new Stats()

    constructor() {
        document.body.appendChild(this.stats.dom)
        this.clock = new Clock()

        this.loader = new Loader()
        this.camera = new Camera()
        this.mainScene = new MainScene()
        this.renderer = new Renderer(this.camera, this.mainScene)
        this.player = new Player(this.loader)

        this.npcManager = new NPCManager(this.loader);

        // Adiciona o grupo com todos os NPCs à cena
        this.mainScene.scene.add(this.npcManager.group);

        this.npcManager.spawn({ x: 5, y: -1.5, z: -10 });
        this.npcManager.spawn({ x: -3, y: -1.5, z: -8 });

        this.loader.gltfLoad.load("/models/5v5_game_map.glb", (gltf) => {
            const model = gltf.scene
            model.scale.set(.001, .001, .001)
            model.position.set(0, -2, 0)
            model.traverse((child) => {
                if (child instanceof Mesh && child.geometry) {
                    child.geometry.computeBoundsTree()
                    child.material.wireframe = false
                    this.collisionMeshes.push(child)
                }
            })

            const directLight = new DirectionalLight(0xffffff, 1)
            directLight.position.set(3, 6, -5)
            directLight.castShadow = true
            directLight.target = model
            this.mainScene.scene.add(directLight)
            this.mainScene.scene.add(new DirectionalLightHelper(directLight))
            this.mainScene.scene.add(model)

           
            this.player.position.set(0, 10, 0)
            this.mainScene.scene.add(this.player)
           
        })

        this.update()
        window.addEventListener("mousedown", (event) => {
            if (event.button === 0) {  
                const direction = new Vector3()
                this.camera.perspectiveCamera.getWorldDirection(direction)

                const npcsMeshes = this.npcManager.collectNpcMeshes(this.npcManager.npcs);
                this.player.attack(npcsMeshes, direction);

                this.player.setState("CharacterArmature|Sword_Slash", 1.8)
            }
        });

        window.addEventListener("keydown", (e) => this.keysPressed.add(e.key.toLowerCase()))
        window.addEventListener("keyup", (e) => this.keysPressed.delete(e.key.toLowerCase()))
    }

    applyGravity(delta: number) {
        if (!this.hit) {
            this.velocityY += this.gravity * delta
        } else {
            this.velocityY = 0
        }
        this.playerImpulse.y = this.velocityY * delta
    }

    checkGroundCollision(): boolean {
        const origin = this.player.position.clone()
        origin.y += 0.5 // altura do ponto de origem do ray

        this.raycaster.set(origin, this.down)
        const intersects: any[] = []

        this.collisionMeshes.forEach(mesh => {
            const hits = this.raycaster.intersectObject(mesh, true)
            if (hits.length > 0) {
                intersects.push(...hits)
            }
        })

        if (intersects.length > 0) {
            const firstHit = intersects[0]
            const surfaceY = firstHit.point.y

            const playerHeight = 1.0
            const playerFootY = this.player.position.y - playerHeight / 2
            const distanceToGround = playerFootY - surfaceY
            const threshold = 0.05

            if (distanceToGround < 0) {
                this.hit = true
                const targetY = surfaceY + playerHeight / 2
                this.player.position.y = MathUtils.lerp(this.player.position.y, targetY, 0.25)
                this.velocityY = 0
            } else if (distanceToGround < threshold) {
                this.hit = true
                const targetY = surfaceY + playerHeight / 2
                this.player.position.y = MathUtils.lerp(this.player.position.y, targetY, 0.25)
                this.velocityY = 0
            } else {
                this.hit = false
            }
            return true
        } else {
            this.hit = false
            return false
        }
    }

    update = () => {
        requestAnimationFrame(this.update)
        this.stats.update()
        this.renderer.update()
        const delta = this.clock.getDelta()

        this.camera.update(this.player)
        this.player.update(delta)
        this.npcManager.update(delta);

        // Rotação baseada na câmera
        this.camera.perspectiveCamera.getWorldDirection(this.playerDirection)
        this.playerDirection.y = 0
        this.playerDirection.normalize()

        const angle = Math.atan2(this.playerDirection.x, this.playerDirection.z)
        this.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), angle)

        // Entrada do teclado (direção)
        if (this.keysPressed.has("w") && !this.keysPressed.has("shift")) {
            this.playerImpulse.add(this.playerDirection.clone().multiplyScalar(this.velocity * delta))
            this.player.setState("CharacterArmature|Walk", 1.5)
        } else if (this.keysPressed.has("w") && this.keysPressed.has("shift")) {
            this.playerImpulse.add(this.playerDirection.clone().multiplyScalar(this.velocity * 2.5 * delta))
            this.player.setState("CharacterArmature|Run", 1.8)
        } else if (this.keysPressed.has("s")) {
            this.playerImpulse.add(this.playerDirection.clone().multiplyScalar(-this.velocity * delta))
            this.player.setState("CharacterArmature|Run_Back", 1.5)
        } else if (this.keysPressed.has("a")) {
            const side = new Vector3(this.playerDirection.z, 0, -this.playerDirection.x)
            this.playerImpulse.add(side.clone().multiplyScalar((this.velocity * 2) * delta))
            this.player.setState("CharacterArmature|Run_Left", 1.0)
        } else if (this.keysPressed.has("d")) {
            const side = new Vector3(-this.playerDirection.z, 0, this.playerDirection.x)
            this.playerImpulse.add(side.clone().multiplyScalar((this.velocity * 2) * delta))
            this.player.setState("CharacterArmature|Run_Right", 1.0)
            
        }        
        else {
            this.player.setState("CharacterArmature|Idle", 1.0)
        }

        

        this.player.quaternion.slerpQuaternions(
            this.player.quaternion,
            this.quaternion,
            delta * 4
        )

        // Aplica gravidade antes de mover
        this.applyGravity(delta)

        // Move apenas em X e Z antes da checagem de colisão no Y
        this.player.position.add(new Vector3(this.playerImpulse.x, 0, this.playerImpulse.z))

        // Checa colisão no chão (e ajusta posição Y se necessário)
        this.checkGroundCollision()

        // Depois de ajustar o Y com gravidade e colisão, aplica o deslocamento Y
        this.player.position.y += this.playerImpulse.y

        // Limpa impulso
        this.playerImpulse.set(0, 0, 0)
    }

}

new Experience()

