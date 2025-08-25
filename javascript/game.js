/*
================================================================================
Super Mario (Phaser 3) — Versión DOCUMENTADA en español
---------------------------------------------------------------------------------
Este archivo concentra la lógica principal del juego: configuración, carga de
recursos, creación de entidades, control del jugador, actualización del estado
y flujo del nivel. Los comentarios explican **qué hace cada parte** y **por qué**.

▶ Requisitos
- Phaser 3 (incluye Arcade Physics).
- Assets ubicados en la carpeta `assets/` según las rutas usadas.

▶ Estructura general
1) Constantes y configuración del motor (Phaser.Game)
2) Carga de recursos (preload)
3) Inicialización y creación de la escena (create)
4) Bucle del juego (update)
5) Auxiliares: sonidos, controles, HUD, generación del mundo, etc.

NOTA: Se han añadido comentarios extensivos y aclaraciones. No se modifica la
lógica salvo detalles neutros (p. ej., eliminación de artefactos de texto al final).
================================================================================
*/

// Referencia a GIF(s) de carga (si existen en el DOM)
const loadingGif = document.querySelectorAll('.loading-gif');

// Detección simple de dispositivo móvil por User-Agent
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
}

// Bandera de dispositivo para ajustar UI y controles
const mobileDevice = isMobileDevice();

// Dimensiones base del lienzo de juego
const screenWidth = 1200; // Ancho visible del navegador
const screenHeight = 800; // Alto (ligera ampliación)

// Velocidades y gravedad derivadas del tamaño de pantalla (escalado responsivo)
const velocityX = screenWidth / 4.5;
const velocityY = screenHeight / 1.15;
const levelGravity = velocityY * 2; // Gravedad vertical del mundo

// Configuración de Phaser
var config = {
    type: Phaser.AUTO, // Selecciona automáticamente WebGL o Canvas
    width: screenWidth,
    height: screenHeight,
    backgroundColor: 0x000000,
    parent: 'game', // ID del contenedor <div id="game">
    preserveDrawingBuffer: true, // Permite hacer capturas (por ejemplo)
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: levelGravity }, // Gravedad global en Y
            debug: false // Mostrar colisionadores (útil durante desarrollo)
        }
    },
    scene: {
        key: 'level-1', // Identificador de la escena
        preload: preload,
        create: create,
        update: update
    },
    version: '0.7.3'
};

// Parámetros de mundo y plataformas
const worldWidth = screenWidth * 11; // Mundo más ancho que la pantalla
const platformHeight = screenHeight / 5; // Altura del "suelo"
const startOffset = screenWidth / 2.5; // Offset inicial del jugador
const platformPieces = 100; // Cantidad de segmentos de piso a generar
const platformPiecesWidth = (worldWidth - screenWidth) / platformPieces; // Ancho de segmento

// Estado global del nivel y entidades
var isLevelOverworld; // true: exterior; false: subterráneo
var worldHolesCoords = []; // Guarda espacios vacíos (huecos) en el piso
var emptyBlocksList = []; // (Reservado) lista de bloques vacíos
var player; // Sprite del jugador
var playerController; // Estado de inputs y movimiento suavizado
var playerState = 0; // 0 = pequeño, 1 = grande, 2 = fuego
var playerInvulnerable = false; // Invulnerabilidad temporal
var playerBlocked = false; // Bloquea inputs/movimiento (transiciones)
var playerFiring = false; // Disparo activo
var fireInCooldown = false; // Enfriamiento de disparo
var furthestPlayerPos = 0; // Para gestionar la cámara (no volver atrás)
var flagRaised = false; // Verdadero cuando se sube la bandera final

// Mapa de teclas (se llenará en createControls)
var controlKeys = {
    JUMP: null,
    DOWN: null,
    LEFT: null,
    RIGHT: null,
    FIRE: null,
    PAUSE: null
};

// Estado de HUD / juego
var score = 0; // Puntuación
var timeLeft = 300; // Tiempo restante (segundos)
var levelStarted = false; // Arrancó el nivel jugable
var reachedLevelEnd = false; // La cámara alcanzó el final del nivel
var smoothedControls; // Control lateral con aceleración/desaceleración
var gameOver = false; // Fin de juego
var gameWinned = false; // Victoria

// Instancia del juego
var game = new Phaser.Game(config);

// --------------------------------------------------------------------------------
// Clase auxiliar: control horizontal suavizado
// --------------------------------------------------------------------------------
var SmoothedHorionztalControl = new Phaser.Class({
    initialize: function SmoothedHorionztalControl(speed) {
        this.msSpeed = speed; // Velocidad de cambio por milisegundo
        this.value = 0; // -1 (izq) .. 0 (quieto) .. 1 (der)
    },
    /**
     * Empuja la dirección hacia la izquierda, con límites y reseteos.
     * @param {number} delta - tiempo transcurrido (ms) por frame
     */
    moveLeft: function (delta) {
        if (this.value > 0) {
            this.reset();
        }
        this.value -= this.msSpeed * 3.5;
        if (this.value < -1) {
            this.value = -1;
        }
        // Acumula tiempo de pulsación (útil para animaciones)
        playerController.time.rightDown += delta;
    },
    /**
     * Empuja la dirección hacia la derecha, con límites y reseteos.
     */
    moveRight: function (delta) {
        if (this.value < 0) {
            this.reset();
        }
        this.value += this.msSpeed * 3.5;
        if (this.value > 1) {
            this.value = 1;
        }
        playerController.time.leftDown += delta;
    },
    /** Reinicia a estado neutro */
    reset: function () {
        this.value = 0;
    }
});

// --------------------------------------------------------------------------------
// CARGA DE RECURSOS (sprites, audio, plugins, etc.)
// --------------------------------------------------------------------------------
function preload() {
    // Fuentes bitmap y plugins de UI
    this.load.bitmapFont(
        'carrier_command',
        'assets/fonts/carrier_command.png',
        'assets/fonts/carrier_command.xml'
    );
    this.load.plugin(
        'rexvirtualjoystickplugin',
        'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js',
        true
    );
    this.load.plugin(
        'rexcheckboxplugin',
        'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexcheckboxplugin.min.js',
        true
    );
    this.load.plugin(
        'rexsliderplugin',
        'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexsliderplugin.min.js',
        true
    );
    this.load.plugin(
        'rexkawaseblurpipelineplugin',
        'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexkawaseblurpipelineplugin.min.js',
        true
    );

    // Estilo/nivel: exterior por defecto
    isLevelOverworld = true;
    let levelStyle = 'overworld';

    // Entidades del jugador (diferentes estados)
    this.load.spritesheet('mario', 'assets/entities/mario.png', {
        frameWidth: 95,
        frameHeight: 95
    });
    this.load.spritesheet('mario-grown', 'assets/entities/mario-grown.png', {
        frameWidth: 85,
        frameHeight: 95
    });
    this.load.spritesheet('mario-fire', 'assets/entities/mario-fire.png', {
        frameWidth: 76,
        frameHeight: 95
    });
    // Enemigos
    this.load.spritesheet('goomba', `assets/entities/${levelStyle}/goomba.png`, {
        frameWidth: 48,
        frameHeight: 48
    });

    // Escenografía y meta
    this.load.image('background', 'assets/scenery/overworld/background.jpg');
    this.load.image('flag-mast', 'assets/scenery/flag-mast.png');

    this.load.spritesheet('final-flag', 'assets/scenery/final-flag.png', {
        frameWidth: 95,
        frameHeight: 95
    });
    this.load.image('floorbricks', `assets/scenery/${levelStyle}/floorbricks.png`);
    this.load.image('start-floorbricks', 'assets/scenery/overworld/floorbricks.png');

    // Bloques
    this.load.image('block', `assets/blocks/${levelStyle}/block.png`);
    this.load.image('emptyBlock', `assets/blocks/${levelStyle}/emptyBlock.png`);
    this.load.image('immovableBlock', `assets/blocks/${levelStyle}/immovableBlock.png`);
    this.load.spritesheet(
        'brick-debris',
        `assets/blocks/${levelStyle}/brick-debris.png`,
        { frameWidth: 8, frameHeight: 8 }
    );
    this.load.spritesheet('mistery-block', `assets/blocks/${levelStyle}/misteryBlock.png`, {
        frameWidth: 16,
        frameHeight: 16
    });
    this.load.spritesheet('custom-block', 'assets/blocks/overworld/customBlock.png', {
        frameWidth: 16,
        frameHeight: 16
    });

    // Coleccionables
    this.load.spritesheet('coin', 'assets/collectibles/coin.png', {
        frameWidth: 16,
        frameHeight: 16
    });
    this.load.spritesheet(
        'ground-coin',
        'assets/collectibles/underground/ground-coin.png',
        { frameWidth: 10, frameHeight: 14 }
    );
    this.load.spritesheet(
        'fire-flower',
        `assets/collectibles/${levelStyle}/fire-flower.png`,
        { frameWidth: 16, frameHeight: 16 }
    );
    this.load.image('live-mushroom', 'assets/collectibles/live-mushroom.png');
    this.load.image('super-mushroom', 'assets/collectibles/super-mushroom.png');

    // Sonidos (música y FX)
    this.load.audio('music', 'assets/sound/music/overworld/theme.mp3');
    this.load.audio('underground-music', 'assets/sound/music/underground/theme.mp3');
    this.load.audio('hurry-up-music', `assets/sound/music/${levelStyle}/hurry-up-theme.mp3`);
    this.load.audio('gameoversong', 'assets/sound/music/gameover.mp3');
    this.load.audio('win', 'assets/sound/music/win.wav');
    this.load.audio('jumpsound', 'assets/sound/effects/jump.mp3');
    this.load.audio('coin', 'assets/sound/effects/coin.mp3');
    this.load.audio('powerup-appears', 'assets/sound/effects/powerup-appears.mp3');
    this.load.audio('consume-powerup', 'assets/sound/effects/consume-powerup.mp3');
    this.load.audio('powerdown', 'assets/sound/effects/powerdown.mp3');
    this.load.audio('goomba-stomp', 'assets/sound/effects/goomba-stomp.wav');
    this.load.audio('flagpole', 'assets/sound/effects/flagpole.mp3');
    this.load.audio('fireball', 'assets/sound/effects/fireball.mp3');
    this.load.audio('kick', 'assets/sound/effects/kick.mp3');
    this.load.audio('time-warning', 'assets/sound/effects/time-warning.mp3');
    this.load.audio(
        'here-we-go',
        Phaser.Math.Between(0, 100) < 98
            ? 'assets/sound/effects/here-we-go.mp3'
            : 'assets/sound/effects/cursed-here-we-go.mp3'
    );
    this.load.audio('pauseSound', 'assets/sound/effects/pause.wav');
    this.load.audio('block-bump', 'assets/sound/effects/block-bump.wav');
    this.load.audio('break-block', 'assets/sound/effects/break-block.wav');
}

// --------------------------------------------------------------------------------
// Inicialización de sonidos y grupos de audio para gestionar volúmenes/pausas
// --------------------------------------------------------------------------------
function initSounds() {
    // Grupos lógicos de audio (música vs efectos)
    this.musicGroup = this.add.group();
    this.effectsGroup = this.add.group();

    // Temas musicales
    this.musicTheme = this.sound.add('music', { volume: 0 });
    this.musicTheme.play({ loop: -1 });
    this.musicGroup.add(this.musicTheme);

    this.undergroundMusicTheme = this.sound.add('underground-music', { volume: 0 });
    this.musicGroup.add(this.undergroundMusicTheme);

    this.hurryMusicTheme = this.sound.add('hurry-up-music', { volume: 0 });
    this.musicGroup.add(this.hurryMusicTheme);

    // Otros sonidos (victoria/derrota)
    this.gameOverSong = this.sound.add('gameoversong', { volume: 0 });
    this.musicGroup.add(this.gameOverSong);
    this.winSound = this.sound.add('win', { volume: 0 });
    this.musicGroup.add(this.winSound);

    // Efectos del jugador y entorno
    this.jumpSound = this.sound.add('jumpsound', { volume: 0 });
    this.effectsGroup.add(this.jumpSound);
    this.coinSound = this.sound.add('coin', { volume: 0 });
    this.effectsGroup.add(this.coinSound);
    this.powerUpAppearsSound = this.sound.add('powerup-appears', { volume: 0 });
    this.effectsGroup.add(this.powerUpAppearsSound);
    this.consumePowerUpSound = this.sound.add('consume-powerup', { volume: 0 });
    this.effectsGroup.add(this.consumePowerUpSound);
    this.powerDownSound = this.sound.add('powerdown', { volume: 0 });
    this.effectsGroup.add(this.powerDownSound);
    this.goombaStompSound = this.sound.add('goomba-stomp', { volume: 0 });
    this.effectsGroup.add(this.goombaStompSound);
    this.flagPoleSound = this.sound.add('flagpole', { volume: 0 });
    this.effectsGroup.add(this.flagPoleSound);
    this.fireballSound = this.sound.add('fireball', { volume: 0 });
    this.effectsGroup.add(this.fireballSound);
    this.kickSound = this.sound.add('kick', { volume: 0 });
    this.effectsGroup.add(this.kickSound);
    this.timeWarningSound = this.sound.add('time-warning', { volume: 0 });
    this.effectsGroup.add(this.timeWarningSound);
    this.hereWeGoSound = this.sound.add('here-we-go', { volume: 0 });
    this.effectsGroup.add(this.hereWeGoSound);
    this.pauseSound = this.sound.add('pauseSound', { volume: 0 });
    this.effectsGroup.add(this.pauseSound);
    this.blockBumpSound = this.sound.add('block-bump', { volume: 0 });
    this.effectsGroup.add(this.blockBumpSound);
    this.breakBlockSound = this.sound.add('break-block', { volume: 0 });
    this.effectsGroup.add(this.breakBlockSound);
}

// --------------------------------------------------------------------------------
// CREATE — Se ejecuta una sola vez: prepara mundo, jugador, cámaras y controles
// --------------------------------------------------------------------------------
function create() {
    // Estado de control del jugador
    playerController = {
        time: { leftDown: 0, rightDown: 0 }, // Acumuladores para animaciones
        direction: { positive: true }, // true: mira a la derecha
        speed: { run: velocityX } // Velocidad base horizontal
    };

    // Límites del mundo y cámara
    this.physics.world.setBounds(0, 0, worldWidth, screenHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, screenHeight);
    this.cameras.main.isFollowing = false; // Al inicio no sigue al jugador

    // Inicialización por secciones
    initSounds.call(this);
    createAnimations.call(this); // (Debe existir en otro módulo del proyecto)
    createPlayer.call(this); // Crea sprite y físicas del jugador
    generateLevel.call(this); // Genera plataformas, bloques y triggers
    drawWorld.call(this); // Pinta fondo, meta (bandera/castillo), etc.

    // Arranque directo en overworld (salto de pantalla inicial)
    bootIntoOverworld.call(this);

    // Enemigos, controles y preferencias
    createGoombas.call(this); // (Debe existir en otra parte del proyecto)
    createControls.call(this); // Teclado/joystick virtual
    applySettings.call(this); // Aplica opciones guardadas (sonido, etc.)

    // Control lateral suavizado
    smoothedControls = new SmoothedHorionztalControl(0.001);
}

// --------------------------------------------------------------------------------
// Entradas: teclado y joystick virtual (móvil)
// --------------------------------------------------------------------------------
function createControls() {
    // Joystick virtual (solo visible en móvil)
    this.joyStick = this.plugins.get('rexvirtualjoystickplugin').add(this, {
        x: screenWidth * 0.118,
        y: screenHeight / 1.68,
        radius: mobileDevice ? 100 : 0,
        base: this.add.circle(0, 0, mobileDevice ? 75 : 0, 0x0000000, 0.05),
        thumb: this.add.circle(0, 0, mobileDevice ? 25 : 0, 0xcccccc, 0.2)
    });

    // Mapeo de teclas configurable (persistente en localStorage)
    const keyNames = ['JUMP', 'DOWN', 'LEFT', 'RIGHT', 'FIRE', 'PAUSE'];
    const defaultCodes = [
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.S,
        Phaser.Input.Keyboard.KeyCodes.A,
        Phaser.Input.Keyboard.KeyCodes.D,
        Phaser.Input.Keyboard.KeyCodes.Q,
        Phaser.Input.Keyboard.KeyCodes.ESC
    ];

    keyNames.forEach((keyName, i) => {
        const keyCode = localStorage.getItem(keyName)
            ? Number(localStorage.getItem(keyName))
            : defaultCodes[i];
        controlKeys[keyName] = this.input.keyboard.addKey(keyCode);
    });
}

// --------------------------------------------------------------------------------
// Utilidad: genera coordenadas aleatorias evitando huecos del suelo
// --------------------------------------------------------------------------------
function generateRandomCoordinate(entitie = false, ground = true) {
    // Rango de aparición: entidades no cubren el extremo del mundo
    const startPos = entitie ? screenWidth * 1.5 : screenWidth;
    const endPos = entitie ? worldWidth - screenWidth * 3 : worldWidth;

    let coordinate = Phaser.Math.Between(startPos, endPos);

    // Si no es en el suelo, no comprobamos huecos
    if (!ground) return coordinate;

    // Evita que aparezcan cosas en huecos del piso
    for (let hole of worldHolesCoords) {
        if (
            coordinate >= hole.start - platformPiecesWidth * 1.5 &&
            coordinate <= hole.end
        ) {
            return generateRandomCoordinate.call(this, entitie, ground);
        }
    }
    return coordinate;
}

// --------------------------------------------------------------------------------
// Dibuja elementos de fondo y la meta (mástil/flag/castillo)
// --------------------------------------------------------------------------------
function drawWorld() {
    // Fondo que se repite en X (tileSprite)
    this.add
        .tileSprite(0, -screenHeight / 5, worldWidth, screenHeight, 'background')
        .setOrigin(0)
        .setDepth(-1);

    let propsY = screenHeight - platformHeight; // Línea del suelo

    // (Espacio para condicionar decorados por bioma)
    if (isLevelOverworld) {
        // Overworld: se podrían añadir nubes, montañas, etc.
    }

    // Mástil de la bandera final
    this.finalFlagMast = this.add
        .tileSprite(
            worldWidth - worldWidth / 30,
            propsY,
            16,
            167,
            'flag-mast'
        )
        .setOrigin(0, 1)
        .setScale(screenHeight / 400);
    this.physics.add.existing(this.finalFlagMast);
    this.finalFlagMast.immovable = true;
    this.finalFlagMast.allowGravity = false;
    this.finalFlagMast.body.setSize(3, 167);
    // Al solaparse con el jugador se intenta izar la bandera
    this.physics.add.overlap(player, this.finalFlagMast, null, raiseFlag, this);
    // Los bloques del piso colisionan con el mástil
    this.physics.add.collider(this.platformGroup.getChildren(), this.finalFlagMast);

    // Sprite de la bandera (que sube con tween)
    this.finalFlag = this.add
        .image(worldWidth - worldWidth / 30, propsY * 0.93, 'final-flag')
        .setOrigin(0.5, 1);
    this.finalFlag.setScale(screenHeight / 800);

    // Castillo de llegada (decorativo)
    this.add
        .image(worldWidth - worldWidth / 75, propsY, 'castle')
        .setOrigin(0.5, 1)
        .setScale(screenHeight / 300);
}

// --------------------------------------------------------------------------------
// Generación del nivel: suelo (plataformas), huecos, bloques y triggers
// --------------------------------------------------------------------------------
function generateLevel() {
    let pieceStart = screenWidth; // Comienza fuera de la vista inicial
    let lastWasHole = 0; // Evita huecos consecutivos largos
    let lastWasStructure = 0; // Espacia estructuras (tubos/bloques)

    // Grupos de objetos físicos
    this.platformGroup = this.add.group();
    this.fallProtectionGroup = this.add.group();
    this.blocksGroup = this.add.group();
    this.constructionBlocksGroup = this.add.group();
    this.misteryBlocksGroup = this.add.group();
    this.immovableBlocksGroup = this.add.group();
    this.groundCoinsGroup = this.add.group();

    // Si fuese subterráneo, se añaden paredes/techo específicos
    if (!isLevelOverworld) {
        this.blocksGroup.add(
            this.add
                .tileSprite(
                    screenWidth,
                    screenHeight - platformHeight / 1.2,
                    16,
                    screenHeight - platformHeight,
                    'block2'
                )
                .setScale(screenHeight / 345)
                .setOrigin(0, 1)
        );
        this.undergroundRoof = this.add
            .tileSprite(
                screenWidth * 1.2,
                screenHeight / 13,
                worldWidth / 2.68,
                16,
                'block2'
            )
            .setScale(screenHeight / 345)
            .setOrigin(0);
        this.blocksGroup.add(this.undergroundRoof);
    }

    // Bucle de piezas de suelo/huecos
    for (i = 0; i <= platformPieces; i++) {
        let number = Phaser.Math.Between(0, 100);

        // Condición para colocar suelo o crear hueco
        if (
            pieceStart >=
            (lastWasHole > 0 || lastWasStructure > 0 || worldWidth - platformPiecesWidth * 4) ||
            number <= 0 ||
            pieceStart <= screenWidth * 2 ||
            pieceStart >= worldWidth - screenWidth * 2
        ) {
            // Colocar pieza de suelo
            lastWasHole--;
            let Npiece = this.add
                .tileSprite(
                    pieceStart,
                    screenHeight,
                    platformPiecesWidth,
                    platformHeight,
                    'floorbricks'
                )
                .setScale(2)
                .setOrigin(0, 0.5);
            this.physics.add.existing(Npiece);
            Npiece.body.immovable = true;
            Npiece.body.allowGravity = false;
            Npiece.isPlatform = true;
            Npiece.depth = 2;
            this.platformGroup.add(Npiece);
            this.physics.add.collider(player, Npiece);

            // Probablemente generar estructura (mistery blocks, etc.)
            if (
                !(
                    pieceStart >=
                    worldWidth - screenWidth * (isLevelOverworld ? 1 : 1.5)
                ) &&
                pieceStart > screenWidth + platformPiecesWidth * 2 &&
                lastWasHole < 1 &&
                lastWasStructure < 1
            ) {
                lastWasStructure = generateStructure.call(this, pieceStart); // (Definido en otra parte)
            } else {
                lastWasStructure--;
            }
        } else {
            // Registrar hueco (coordenadas de inicio/fin)
            worldHolesCoords.push({
                start: pieceStart,
                end: pieceStart + platformPiecesWidth * 2
            });
            lastWasHole = 2;
            // Agrega "protecciones" (marcadores invisibles) en bordes del hueco
            this.fallProtectionGroup.add(
                this.add
                    .rectangle(
                        pieceStart + platformPiecesWidth * 2,
                        screenHeight - platformHeight,
                        5,
                        5
                    )
                    .setOrigin(0, 1)
            );
            this.fallProtectionGroup.add(
                this.add
                    .rectangle(
                        pieceStart,
                        screenHeight - platformHeight,
                        5,
                        5
                    )
                    .setOrigin(1, 1)
            );
        }

        // Avanza el cursor para la siguiente pieza (separación fija)
        pieceStart += platformPiecesWidth * 2;
    }

    // Trigger de inicio (bloque/tubo que arranca el nivel cronometrado)
    this.startScreenTrigger = this.add
        .tileSprite(
            screenWidth,
            screenHeight - platformHeight,
            32,
            28,
            'horizontal-tube'
        )
        .setScale(screenHeight / 345)
        .setOrigin(1, 1);
    this.startScreenTrigger.depth = 4;
    this.physics.add.existing(this.startScreenTrigger);
    this.startScreenTrigger.body.allowGravity = false;
    this.startScreenTrigger.body.immovable = true;
    this.physics.add.collider(player, this.startScreenTrigger, startLevel, null, this);

    // Pared invisible que evita regresar completamente al inicio
    let invisibleWall2 = this.add
        .rectangle(screenWidth, screenHeight - platformHeight, 1, screenHeight)
        .setOrigin(0.5, 1);
    this.physics.add.existing(invisibleWall2);
    invisibleWall2.body.allowGravity = false;
    invisibleWall2.body.immovable = true;
    this.physics.add.collider(player, invisibleWall2);
    this.fallProtectionGroup.add(invisibleWall2);

    // Configuración específica si no es overworld
    if (!isLevelOverworld) {
        // Tubo vertical de salida y trigger final subterráneo
        this.verticalTube = this.add
            .tileSprite(
                worldWidth - screenWidth,
                screenHeight - platformHeight,
                32,
                screenHeight,
                'vertical-extralarge-tube'
            )
            .setScale(screenHeight / 345)
            .setOrigin(1, 1);
        this.verticalTube.depth = 2;
        this.physics.add.existing(this.verticalTube);
        this.verticalTube.body.allowGravity = false;
        this.verticalTube.body.immovable = true;
        this.physics.add.collider(player, this.verticalTube);

        this.finalTrigger = this.add
            .tileSprite(
                worldWidth - screenWidth * 1.03,
                screenHeight - platformHeight,
                40,
                31,
                'horizontal-final-tube'
            )
            .setScale(screenHeight / 345)
            .setOrigin(1, 1);
        this.finalTrigger.depth = 2;
        this.physics.add.existing(this.finalTrigger);
        this.finalTrigger.body.allowGravity = false;
        this.finalTrigger.body.immovable = true;
        this.physics.add.collider(
            player,
            this.finalTrigger,
            teleportToLevelEnd,
            null,
            this
        );

        let invisibleWall1 = this.add
            .rectangle(worldWidth - screenWidth, screenHeight - platformHeight, 1, screenHeight)
            .setOrigin(0.5, 1);
        this.physics.add.existing(invisibleWall1);
        invisibleWall1.body.allowGravity = false;
        invisibleWall1.body.immovable = true;
        this.physics.add.collider(player, invisibleWall1);
        this.fallProtectionGroup.add(invisibleWall1);
    }

    // Activar físicas y colisiones para cada grupo generado dinámicamente
    let fallProtections = this.fallProtectionGroup.getChildren();
    for (let i = 0; i < fallProtections.length; i++) {
        this.physics.add.existing(fallProtections[i]);
        fallProtections[i].body.allowGravity = false;
        fallProtections[i].body.immovable = true;
    }

    let misteryBlocks = this.misteryBlocksGroup.getChildren();
    for (let i = 0; i < misteryBlocks.length; i++) {
        this.physics.add.existing(misteryBlocks[i]);
        misteryBlocks[i].body.allowGravity = false;
        misteryBlocks[i].body.immovable = true;
        misteryBlocks[i].depth = 2;
        misteryBlocks[i].anims.play('mistery-block-default', true);
        this.physics.add.collider(
            player,
            misteryBlocks[i],
            revealHiddenBlock,
            null,
            this
        );
    }

    let blocks = this.blocksGroup.getChildren();
    for (let i = 0; i < blocks.length; i++) {
        this.physics.add.existing(blocks[i]);
        blocks[i].body.allowGravity = false;
        blocks[i].body.immovable = true;
        blocks[i].depth = 2;
        this.physics.add.collider(player, blocks[i], destroyBlock, null, this);
    }

    let constructionBlocks = this.constructionBlocksGroup.getChildren();
    for (let i = 0; i < constructionBlocks.length; i++) {
        this.physics.add.existing(constructionBlocks[i]);
        constructionBlocks[i].isImmovable = true;
        constructionBlocks[i].body.allowGravity = false;
        constructionBlocks[i].body.immovable = true;
        constructionBlocks[i].depth = 2;
        this.physics.add.collider(
            player,
            constructionBlocks[i],
            destroyBlock,
            null,
            this
        );
    }

    let immovableBlocks = this.immovableBlocksGroup.getChildren();
    for (let i = 0; i < immovableBlocks.length; i++) {
        this.physics.add.existing(immovableBlocks[i]);
        immovableBlocks[i].body.allowGravity = false;
        immovableBlocks[i].body.immovable = true;
        immovableBlocks[i].depth = 2;
        this.physics.add.collider(player, immovableBlocks[i]);
    }

    let groundCoins = this.groundCoinsGroup.getChildren();
    for (let i = 0; i < groundCoins.length; i++) {
        this.physics.add.existing(groundCoins[i]);
        groundCoins[i].anims.play('ground-coin-default', true);
        groundCoins[i].body.allowGravity = false;
        groundCoins[i].body.immovable = true;
        groundCoins[i].depth = 2;
        this.physics.add.overlap(player, groundCoins[i], collectCoin, null, this);
    }
}

// --------------------------------------------------------------------------------
// Trigger de arranque del nivel "jugable" (inicia música/tiempo y HUD)
// --------------------------------------------------------------------------------
function startLevel(player, trigger) {
    // Comprueba que el jugador esté realmente empujando el trigger por la derecha
    if (!player.body.blocked.right && !trigger.body.blocked.left) return;

    this.powerDownSound.play();

    // Reacota los límites del mundo (evita volver al prólogo)
    this.physics.world.setBounds(screenWidth, 0, worldWidth, screenHeight);

    // Breve invulnerabilidad inicial
    applyPlayerInvulnerability.call(this, 4000);

    // Animación de salida
    playerBlocked = true;
    player.setVelocityX(5);
    player.anims.play('run', true).flipX = false;
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.hereWeGoSound.play();

    // Transición y puesta a punto del HUD/temporizador
    setTimeout(() => {
        if (!isLevelOverworld) {
            player.y = screenHeight / 5;
            this.musicTheme.stop();
            this.undergroundMusicTheme.play({ loop: -1 });
        }

        player.x = screenWidth / 2;
        player.y = screenHeight - platformHeight - 50;
        this.cameras.main.pan(screenWidth * 1.5, 0, 0);
        playerBlocked = false;
        this.cameras.main.fadeIn(500, 0, 0, 0);
        createHUD.call(this);
        updateTimer.call(this);
        this.startScreenTrigger.destroy();
        levelStarted = true;
        if (this.settingsMenuOpen) hideSettings.call(this);
    }, 1100);
}

// --------------------------------------------------------------------------------
// Arranque directo al Overworld (evita pantalla inicial)
// --------------------------------------------------------------------------------
function bootIntoOverworld() {
    this.physics.world.setBounds(screenWidth, 0, worldWidth, screenHeight);

    try {
        applyPlayerInvulnerability.call(this, 4000);
    } catch (e) { }

    // Estado base
    playerBlocked = false;
    levelStarted = true;

    // Coloca al jugador visible sobre el piso
    player.x = screenWidth / 2; // Centro
    player.y = screenHeight - platformHeight - 50; // Un poco por encima del suelo

    // Posición de cámara al centro del mundo jugable
    this.cameras.main.pan(screenWidth * 1.5, 0, 0);

    // HUD y temporizador (si existen)
    try {
        createHUD.call(this);
    } catch (e) { }
    try {
        updateTimer.call(this);
    } catch (e) { }

    // Limpieza de UI inicial si existiese
    if (this.startScreenTrigger && this.startScreenTrigger.destroy) {
        try {
            this.startScreenTrigger.destroy();
        } catch (e) { }
    }
    if (this.settingsMenuOpen) {
        try {
            hideSettings.call(this);
        } catch (e) { }
    }
}

// --------------------------------------------------------------------------------
// Teletransporte hacia el final del nivel (p. ej., al salir del subterráneo)
// --------------------------------------------------------------------------------
function teleportToLevelEnd(player, trigger) {
    if (!player.body.blocked.right && !trigger.body.blocked.left) return;

    playerBlocked = true;
    this.cameras.main.stopFollow();
    this.powerDownSound.play();

    // Efecto de desvanecimiento del jugador
    this.tweens.add({ targets: player, duration: 75, alpha: 0 });
    this.cameras.main.fadeOut(450, 0, 0, 0);

    // Congruencia de animación según estado del jugador
    player
        .anims.play(
            playerState > 0 ? (playerState == 1 ? 'grown-mario-run' : 'fire-mario-run') : 'run',
            true
        )
        .flipX = false;

    // Retira el techo del subterráneo
    this.undergroundRoof.destroy();

    // Crea un tubo de salida y redecora el entorno final
    setTimeout(() => {
        this.physics.world.setBounds(worldWidth - screenWidth, 0, worldWidth, screenHeight);
        this.tpTube = this.add
            .tileSprite(
                worldWidth - screenWidth / 1.089,
                screenHeight - platformHeight,
                32,
                32,
                'vertical-medium-tube'
            )
            .setScale(screenHeight / 345)
            .setOrigin(1);
        this.tpTube.depth = 4;
        this.physics.add.existing(this.tpTube);
        this.tpTube.body.allowGravity = false;
        this.tpTube.body.immovable = true;
        this.physics.add.collider(player, this.tpTube);
        this.add.rectangle(worldWidth - screenWidth, 0, worldWidth, screenHeight, 0x8585ff).setOrigin(0).depth = -1;
        this.add
            .tileSprite(
                worldWidth - screenWidth,
                screenHeight,
                screenWidth,
                platformHeight,
                'start-floorbricks'
            )
            .setScale(2)
            .setOrigin(0, 0.5).depth = 2;
    }, 500);

    // Reaparece cerca de la meta
    setTimeout(() => {
        player.alpha = 1;
        player.x = worldWidth - screenWidth / 1.08;
        this.cameras.main.pan(worldWidth - screenWidth / 2, 0, 0);
        this.cameras.main.fadeIn(500, 0, 0, 0);
        this.powerDownSound.play();
        this.finalTrigger.destroy();
        this.tweens.add({ targets: player, duration: 500, y: this.tpTube.getBounds().y });
        setTimeout(() => {
            playerBlocked = false;
        }, 500);
    }, 1100);
}

// --------------------------------------------------------------------------------
// Escena de inicio (decorativa) — se mantiene por compatibilidad
// --------------------------------------------------------------------------------
function drawStartScreen() {
    const screenCenterX = this.cameras.main.worldView.x + this.cameras.main.width / 2;

    // Cielo base
    this.add.rectangle(0, 0, screenWidth, screenHeight, 0x8585ff).setOrigin(0).depth = -1;

    // Plataforma visible en portada
    let platform = this.add
        .tileSprite(0, screenHeight, screenWidth / 2, platformHeight, 'start-floorbricks')
        .setScale(2)
        .setOrigin(0, 0.5);
    this.physics.add.existing(platform);
    platform.body.immovable = true;
    platform.body.allowGravity = false;
    this.physics.add.collider(player, platform);

    // (Nubes, montañas, arbustos, valla, etc. — decorativos)
    this.add.image(screenWidth / 50, screenHeight / 3, 'cloud1').setScale(screenHeight / 1725);
    this.add.image(screenWidth / 1.25, screenHeight / 2, 'cloud1').setScale(screenHeight / 1725);
    this.add.image(screenWidth / 1.05, screenHeight / 6.5, 'cloud2').setScale(screenHeight / 1725);
    this.add.image(screenWidth / 3, screenHeight / 3.5, 'cloud2').setScale(screenHeight / 1725);
    this.add.image(screenWidth / 2.65, screenHeight / 2.8, 'cloud2').setScale(screenHeight / 1725);
    this.add.image(screenWidth / 50, screenHeight / 3, 'cloud1').setScale(screenHeight / 1725);
    this.add.image(screenWidth / 25, screenHeight / 10, 'sign').setOrigin(0).setScale(screenHeight / 350);

    let propsY = screenHeight - platformHeight;
    this.add.image(screenWidth / 50, propsY, 'mountain2').setOrigin(0, 1).setScale(screenHeight / 517);
    this.add.image(screenWidth / 300, propsY, 'mountain1').setOrigin(0, 1).setScale(screenHeight / 517);
    this.add.image(screenWidth / 4, propsY, 'bush1').setOrigin(0, 1).setScale(screenHeight / 609);
    this.add.image(screenWidth / 1.55, propsY, 'bush2').setOrigin(0, 1).setScale(screenHeight / 609);
    this.add.image(screenWidth / 1.5, propsY, 'bush2').setOrigin(0, 1).setScale(screenHeight / 609);
    this.add.tileSprite(screenWidth / 15, propsY, 350, 35, 'fence').setOrigin(0, 1).setScale(screenHeight / 863);

    // Bloque de ajustes (abre menú al golpear desde abajo)
    this.customBlock = this.add
        .sprite(screenCenterX, screenHeight - platformHeight * 1.9, 'custom-block')
        .setScale(screenHeight / 345);
    this.customBlock.anims.play('custom-block-default');
    this.physics.add.collider(
        player,
        this.customBlock,
        function () {
            if (player.body.blocked.up) showSettings.call(this);
        },
        null,
        this
    );
    this.physics.add.existing(this.customBlock);
    this.customBlock.body.allowGravity = false;
    this.customBlock.body.immovable = true;

    // Icono de engranaje que también abre ajustes (click/tap)
    this.add
        .image(screenCenterX, screenHeight - platformHeight * 1.9, 'gear')
        .setScale(screenHeight / 13000)
        .setInteractive()
        .on('pointerdown', () => showSettings.call(this));
    this.add.image(screenCenterX * 1.12, screenHeight - platformHeight * 1.5, 'settings-bubble').setScale(screenHeight / 620);
    this.add.sprite(screenCenterX * 1.07, screenHeight - platformHeight, 'npc').setOrigin(0.5, 1).setScale(screenHeight / 365).anims.play('npc-default', true);
}

// --------------------------------------------------------------------------------
// Lógica para izar la bandera y finalizar
// --------------------------------------------------------------------------------
function raiseFlag() {
    if (flagRaised) return false; // Evita ejecución múltiple

    this.cameras.main.stopFollow();
    this.timeLeftText.stopped = true; // Detiene el decremento del tiempo

    // Control musical
    this.musicTheme.stop();
    this.undergroundMusicTheme.stop();
    this.hurryMusicTheme.stop();
    this.flagPoleSound.play();

    // Sube la bandera con tween
    this.tweens.add({ targets: this.finalFlag, duration: 1000, y: screenHeight / 2.2 });

    setTimeout(() => {
        this.winSound.play();
    }, 1000);

    flagRaised = true;
    playerBlocked = true; // Bloquea control durante el final

    addToScore.call(this, 2000, player); // Bonus por completar

    return false;
}

// --------------------------------------------------------------------------------
// Consumo de power-ups (setas y flor de fuego)
// --------------------------------------------------------------------------------
function consumeMushroom(player, mushroom) {
    if (gameOver || gameWinned) return;

    this.consumePowerUpSound.play();
    addToScore.call(this, 1000, mushroom);
    mushroom.destroy();

    if (playerState > 0) return; // Ya es grande o fuego

    // Secuencia de transformación
    playerBlocked = true;
    this.anims.pauseAll();
    this.physics.pause();
    player.setTint(0xfefefe).anims.play('grown-mario-idle');
    let i = 0;
    let interval = setInterval(() => {
        i++;
        player.anims.play(i % 2 === 0 ? 'grown-mario-idle' : 'idle');
        if (i > 5) {
            clearInterval(interval);
            player.clearTint();
        }
    }, 100);

    setTimeout(() => {
        this.physics.resume();
        this.anims.resumeAll();
        playerBlocked = false;
        playerState = 1; // Ahora es grande
        updateTimer.call(this);
    }, 1000);
}

function consumeFireflower(player, fireFlower) {
    if (gameOver || gameWinned) return;

    this.consumePowerUpSound.play();
    addToScore.call(this, 1000, fireFlower);
    fireFlower.destroy();

    if (playerState > 1) return; // Ya es fuego

    let anim = playerState > 0 ? 'grown-mario-idle' : 'idle';

    // Secuencia de transformación
    playerBlocked = true;
    this.anims.pauseAll();
    this.physics.pause();
    player.setTint(0xfefefe).anims.play('fire-mario-idle');
    let i = 0;
    let interval = setInterval(() => {
        i++;
        player.anims.play(i % 2 === 0 ? 'fire-mario-idle' : anim);
        if (i > 5) {
            clearInterval(interval);
            player.clearTint();
        }
    }, 100);

    setTimeout(() => {
        this.physics.resume();
        this.anims.resumeAll();
        playerBlocked = false;
        playerState = 2; // Ahora es Mario fuego
        updateTimer.call(this);
    }, 1000);
}

// --------------------------------------------------------------------------------
// Monedas y puntuación
// --------------------------------------------------------------------------------
function collectCoin(player, coin) {
    this.coinSound.play();
    addToScore.call(this, 200); // Valor por moneda
    coin.destroy();
}

// --------------------------------------------------------------------------------
// UPDATE — Bucle del juego (por frame)
// --------------------------------------------------------------------------------
function update(delta) {
    if (gameOver || gameWinned) return; // No actualizar si terminó

    // Actualiza movimiento del jugador, animaciones y inputs
    updatePlayer.call(this, delta); // (Implementado en otra parte del proyecto)

    // Lógica de cámara: comienza a seguir al jugador al avanzar lo suficiente
    const playerVelocityX = player.body.velocity.x;
    const camera = this.cameras.main;

    if (
        playerVelocityX > 0 &&
        levelStarted &&
        !reachedLevelEnd &&
        !camera.isFollowing &&
        player.x >= screenWidth * 1.5 &&
        player.x >= camera.worldView.x + camera.width / 2
    ) {
        camera.startFollow(player, true, 0.1, 0.05);
        camera.isFollowing = true;
    }

    // Si intenta retroceder tras alcanzar su punto más lejano, libera la cámara
    if (
        playerVelocityX < 0 &&
        furthestPlayerPos < player.x &&
        levelStarted &&
        !reachedLevelEnd &&
        camera.isFollowing
    ) {
        furthestPlayerPos = player.x;
        this.physics.world.setBounds(camera.worldView.x, 0, worldWidth, screenHeight);
        camera.setBounds(camera.worldView.x, 0, worldWidth, screenHeight);
        camera.stopFollow();
        camera.isFollowing = false;
    }

    // Al acercarse al final del mapa subterráneo, deja de seguir
    if (!reachedLevelEnd && !isLevelOverworld && camera.isFollowing && player.x >= worldWidth - screenWidth * 1.5) {
        reachedLevelEnd = true;
        camera.stopFollow();
    }
}

// --------------------------------------------------------------------------------
// NOTAS FINALES
// --------------------------------------------------------------------------------
// • Varias funciones referenciadas (createAnimations, createPlayer, createGoombas,
//   generateStructure, revealHiddenBlock, destroyBlock, createHUD, updateTimer,
//   applySettings, hideSettings, addToScore, applyPlayerInvulnerability,
//   updatePlayer, showSettings) se asumen definidas en otros módulos del juego.
// • Esta versión sólo añade documentación detallada y comentarios en español.
// • Se eliminó un texto residual al final del archivo que no era código válido.
