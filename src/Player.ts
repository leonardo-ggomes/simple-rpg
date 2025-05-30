import {
    CapsuleGeometry,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    AnimationMixer,
    AnimationClip,
    AnimationAction,
    Raycaster,
    Vector3
} from "three";
import Loader from "./Loader";
import NPC from "./NPC";

class Player extends Object3D {
    radius = 0.5;
    capSegments = 10;
    color = "#0000ff";
    height = 1;
    radialSegments = 30;
    loader: Loader;

    mixer!: AnimationMixer;
    clips: Record<string, AnimationClip> = {};
    currentAction: AnimationAction | null = null;
    currentState: string = "";

    collisionMeshes: Mesh[] = []
    raycaster = new Raycaster()
    down = new Vector3(0, 0, -1)
    intersects: any[] = []

    isAttacking = false;
    attackCooldown = 0.8; // segundos, duração do ataque
    attackTimer = 0;

    constructor(loader: Loader) {
        super();
        this.loader = loader;

        const capsule = new Mesh(
            new CapsuleGeometry(this.radius, this.height, this.capSegments, this.radialSegments),
            new MeshBasicMaterial({ color: this.color, wireframe: true })
        );
        capsule.scale.set(0.5, 0.5, 0.5);
        this.add(capsule);

        this.loader.gltfLoad.load("/models/glTF/character$animated.glb", (gltf) => {
            const model = gltf.scene;
            model.scale.set(0.7, 0.7, 0.7);
            model.position.y = -this.height / 2 // alinhado com a cápsula

            model.traverse((child) => {
                if (child instanceof Mesh && child.geometry) {
                    child.geometry.computeBoundsTree()
                    child.material.wireframe = false
                    this.collisionMeshes.push(child)
                }
            })

            this.add(model);

            // Inicia mixer e animações
            this.mixer = new AnimationMixer(model);

            // Salva todas animações por nome
            gltf.animations.forEach((clip: AnimationClip) => {
                this.clips[clip.name] = clip;
            });

            // Inicia com Idle se existir
            if (this.clips["CharacterArmature|Idle"]) {
                this.setState("CharacterArmature|Idle", 1.0);
            }
        });
    }


    attack(npcs: Mesh[], cameraDirection: Vector3) {
        if (this.isAttacking) return; // se já atacando, ignora

        this.isAttacking = true;
        this.attackTimer = 0;
        this.setState("CharacterArmature|Sword_Slash", 1.8);

        const origin = this.position.clone()
        origin.y += 0.5 // dispara da altura da cabeça

        const direction = cameraDirection.clone().normalize()

        this.raycaster.set(origin, direction)
        const maxDistance = 4 // alcance do ataque em metros

        const hits = this.raycaster.intersectObjects(npcs, true)

        if (hits.length > 0 && hits[0].distance <= maxDistance) {
            const hit = hits[0]
            console.log(hit.object)
            console.log("🎯 NPC atingido:", hit.object.name, "Distância:", hit.distance)

            if (hit.object.userData.type === "npc") {
                const npc = hit.object.userData.parentNpc as NPC;
                npc.takeDamage(50);
            }

        } else {
            console.log("❌ Nenhum NPC atingido.")
        }
    }

    /**
     * Atualiza o mixer (chamar isso no loop de render)
     */
    update(delta: number) {
        if (this.mixer) {
            this.mixer.update(delta);
        }

        // atualiza timer
        if (this.isAttacking) {
            this.attackTimer += delta;
            if (this.attackTimer >= this.attackCooldown) {
                this.isAttacking = false;
                this.attackTimer = 0;
                this.setState("CharacterArmature|Idle", 1.0); // volta para idle
            }
        }
    }

    /**
     * Troca o estado da máquina e executa animação
     */
    setState(name: string, speed: number) {
        if (this.currentState === name || !this.clips[name]) return;

        const clip = this.clips[name];
        const newAction = this.mixer.clipAction(clip);
        newAction.timeScale = speed;
       
        if (this.currentAction) {
            this.currentAction.fadeOut(0.3);
        }

        newAction.reset().fadeIn(0.3).play();

        this.currentAction = newAction;
        this.currentState = name;
    }
}

export default Player;
