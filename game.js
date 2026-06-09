(function(){
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const W = 1300, H = 800;

    // ---------- PLAYER STATS (start at 100) ----------
    let player = {
        x: W/2, y: H/2, radius: 18,
        health: 100, maxHealth: 100,
        damageMultiplier: 1.0,   // start 100% = 1.0
        speed: 5.0,
        xp: 0, level: 1,
        kills: 0,
        invincibleFrames: 0
    };
    
    // Unlocked arrays
    let unlockedWeapons = [];   // each: { id, name, type, baseDamage, cooldownMax, currentCd, special }
    let unlockedAuras = [];     // each: { id, name, effect, damage, range }
    
    // Dynamic entities
    let enemies = [];
    let projectiles = [];
    let loot = [];
    let particles = [];
    let orbitingWeapons = [];    // for orbital type
    
    // Wave system
    let wave = 1;
    let enemiesToSpawn = 8;
    let waveCooldown = 25;
    let bossWave = false;
    
    // Primary auto-attack (basic bolt)
    let primaryCooldown = 0;
    const BASE_ATTACK_DELAY = 16;
    
    // UI Elements
    const hpSpan = document.getElementById('hp');
    const maxHpSpan = document.getElementById('maxHp');
    const dmgMultSpan = document.getElementById('dmgMult');
    const levelSpan = document.getElementById('level');
    const xpSpan = document.getElementById('xp');
    const xpNextSpan = document.getElementById('xpNext');
    const killsSpan = document.getElementById('kills');
    const waveSpan = document.getElementById('wave');
    const weaponCountSpan = document.getElementById('weaponCount');
    const auraCountSpan = document.getElementById('auraCount');
    const upgradePanel = document.getElementById('upgradePanel');
    const upgradeGrid = document.getElementById('upgradeGrid');
    const gameOverPanel = document.getElementById('gameOverPanel');
    const restartBtn = document.getElementById('restartButton');
    const finalWaveSpan = document.getElementById('finalWave');
    const finalKillsSpan = document.getElementById('finalKills');
    
    let mouseX = W/2, mouseY = H/2;
    let gameRunning = true;
    let upgradePending = false;
    
    // ---------- WEAPON LIBRARY (50 unique) ----------
    function buildWeaponLibrary() {
        let lib = [];
        let id = 0;
        // 1. Elemental bolts (15)
        const elems = ['Fire', 'Ice', 'Lightning', 'Poison', 'Arcane', 'Holy', 'Shadow', 'Nature', 'Crystal', 'Void', 'Inferno', 'Frost', 'Thunder', 'Venom', 'Aether'];
        for(let i=0;i<15;i++) {
            lib.push({ id: id++, name: `${elems[i]} Bolt`, type: 'projectile', baseDamage: 28 + i, cooldownMax: 18 - Math.floor(i/4), special: i%3===0?'pierce':null });
        }
        // 2. Orbiting weapons (12)
        const orbitals = ['Sword', 'Axe', 'Star', 'Shard', 'Blade', 'Crescent', 'Cross', 'Glaive', 'Chakram', 'Sickle', 'Razor', 'Fang'];
        for(let i=0;i<12;i++) {
            lib.push({ id: id++, name: `Orbiting ${orbitals[i]}`, type: 'orbit', baseDamage: 22 + i*2, cooldownMax: 38, special: { orbitSpeed: 0.08, radius: 55 } });
        }
        // 3. Chain / bounce (10)
        for(let i=0;i<10;i++) {
            lib.push({ id: id++, name: `Chain ${['Spark','Arc','Volt','Bounce','Fork','Surge','Prism','Echo','Split','Ripple'][i]}`, type: 'chain', baseDamage: 24 + i*2, cooldownMax: 42, special: { bounces: 3 + Math.floor(i/3) } });
        }
        // 4. Area blasts (8)
        for(let i=0;i<8;i++) {
            lib.push({ id: id++, name: `${['Nova','Explosion','Blast','Eruption','Shockwave','Cataclysm','Radiance','Vortex'][i]}`, type: 'aoe', baseDamage: 38 + i*3, cooldownMax: 58, special: { radius: 95 } });
        }
        // 5. Beam weapons (5)
        for(let i=0;i<5;i++) {
            lib.push({ id: id++, name: `${['Laser','Prism Beam','Solar Ray','Death Ray','Divine Lance'][i]}`, type: 'beam', baseDamage: 45 + i*4, cooldownMax: 50, special: { length: 300, width: 12 } });
        }
        return lib.slice(0,50);
    }
    const weaponLibrary = buildWeaponLibrary();
    
    // ---------- AURA LIBRARY (30 auras) ----------
    function buildAuraLibrary() {
        let auras = [];
        for(let i=0;i<30;i++) {
            let effects = [
                { name: 'Burning', dmg: 9, heal: 0, magnet: false, slow: false },
                { name: 'Lifesteal', dmg: 5, healPerTick: 2 },
                { name: 'Magnet', dmg: 0, magnet: true },
                { name: 'Frostbite', dmg: 7, slow: 0.6 },
                { name: 'Static', dmg: 13, chain: true },
                { name: 'Vampiric', dmg: 4, healPerTick: 3 },
                { name: 'Cursed', dmg: 20, selfDmg: -1 },
                { name: 'Sanctuary', dmg: 6, healNearby: 1 },
                { name: 'Thorns', dmg: 22, reflect: true },
                { name: 'Time Dilation', dmg: 0, slowEnemies: 0.7 },
                { name: 'Venomous', dmg: 11, poison: true },
                { name: 'Radiant', dmg: 15, blind: true },
                { name: 'Chaos', dmg: 18, random: true },
                { name: 'Divine', dmg: 8, healOnKill: 5 },
                { name: 'Corrupting', dmg: 14, armorBreak: true }
            ];
            let e = effects[i % effects.length];
            auras.push({ id: i, name: `${e.name} Aura`, type: e.name, damage: 6 + Math.floor(i/2.5), range: 140, effect: e });
        }
        return auras;
    }
    const auraLibrary = buildAuraLibrary();
    
    // Helper functions
    function updateUI() {
        hpSpan.innerText = Math.floor(player.health);
        maxHpSpan.innerText = player.maxHealth;
        dmgMultSpan.innerText = player.damageMultiplier.toFixed(2);
        levelSpan.innerText = player.level;
        let need = xpNeeded();
        xpSpan.innerText = player.xp;
        xpNextSpan.innerText = need;
        killsSpan.innerText = player.kills;
        waveSpan.innerText = wave;
        weaponCountSpan.innerText = unlockedWeapons.length;
        auraCountSpan.innerText = unlockedAuras.length;
    }
    
    function xpNeeded() { return Math.floor(80 + player.level * 18); }
    
    function addXP(amount) {
        player.xp += amount;
        while(player.xp >= xpNeeded() && gameRunning && !upgradePending) {
            player.xp -= xpNeeded();
            player.level++;
            levelUp();
        }
        updateUI();
    }
    
    // Exponential stat scaling on level up choices
    function levelUp() {
        if(!gameRunning) return;
        upgradePending = true;
        gameRunning = false;
        showUpgradeChoices();
    }
    
    function showUpgradeChoices() {
        let choices = [];
        // Stat upgrades (exponential – multiplicative)
        choices.push({ name: "🔥 DMG x1.35", effect: () => { player.damageMultiplier *= 1.35; }, desc: "Multiply damage by 1.35" });
        choices.push({ name: "❤️ Max HP x1.35", effect: () => { player.maxHealth = Math.floor(player.maxHealth * 1.35); player.health = player.maxHealth; }, desc: "Multiply max health" });
        choices.push({ name: "⚡ Speed +1.5", effect: () => { player.speed += 1.5; }, desc: "Increase movement speed" });
        
        // Random new weapon (if not all 50)
        if(unlockedWeapons.length < 50) {
            let available = weaponLibrary.filter(w => !unlockedWeapons.some(uw => uw.id === w.id));
            if(available.length) {
                let rand = available[Math.floor(Math.random() * available.length)];
                choices.push({ name: `🔫 ${rand.name}`, effect: () => { addWeapon({ ...rand, currentCd: 0 }); }, desc: `Base dmg ${rand.baseDamage}, ${rand.type}` });
            }
        }
        // Random new aura (if not all 30)
        if(unlockedAuras.length < 30) {
            let availableAura = auraLibrary.filter(a => !unlockedAuras.some(ua => ua.id === a.id));
            if(availableAura.length) {
                let randA = availableAura[Math.floor(Math.random() * availableAura.length)];
                choices.push({ name: `✨ ${randA.name}`, effect: () => { unlockedAuras.push({ ...randA }); }, desc: `Deals ${randA.damage} dmg/sec in range` });
            }
        }
        // Random pick 3
        let shuffled = [...choices];
        for(let i=shuffled.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]; }
        let selected = shuffled.slice(0,3);
        upgradeGrid.innerHTML = '';
        selected.forEach(choice => {
            let card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `<h3>${choice.name}</h3><p>${choice.desc}</p>`;
            card.onclick = () => {
                choice.effect();
                closeUpgradePanel();
            };
            upgradeGrid.appendChild(card);
        });
        upgradePanel.classList.remove('hidden');
    }
    
    function addWeapon(weapon) {
        unlockedWeapons.push(weapon);
        updateUI();
    }
    
    function closeUpgradePanel() {
        upgradePanel.classList.add('hidden');
        upgradePending = false;
        gameRunning = true;
        updateUI();
        // recalc attack delay based on dmg multiplier? Not needed
    }
    
    // Primary attack
    function shootPrimary() {
        let dirX = mouseX - player.x;
        let dirY = mouseY - player.y;
        let len = Math.hypot(dirX, dirY);
        if(len < 0.01) dirX=1, dirY=0;
        else dirX/=len, dirY/=len;
        let damage = (22 + player.damageMultiplier * 15) * player.damageMultiplier;
        projectiles.push({
            x: player.x, y: player.y, radius: 7,
            vx: dirX * 11, vy: dirY * 11,
            damage: damage, type: 'bolt', color: '#ffdd88'
        });
    }
    
    // Weapon system (all unlocked weapons fire automatically)
    function updateWeapons() {
        for(let w of unlockedWeapons) {
            if(w.currentCd > 0) w.currentCd--;
            else {
                if(w.type === 'projectile') {
                    let angle = Math.atan2(mouseY - player.y, mouseX - player.x);
                    let dmg = (w.baseDamage + player.damageMultiplier * 12) * player.damageMultiplier;
                    projectiles.push({
                        x: player.x, y: player.y, radius: 6,
                        vx: Math.cos(angle)*10, vy: Math.sin(angle)*10,
                        damage: dmg, type: 'elemental', color: '#ffaa66'
                    });
                    w.currentCd = w.cooldownMax;
                }
                else if(w.type === 'orbit') {
                    orbitingWeapons.push({
                        angle: Math.random()*Math.PI*2, radius: 50, damage: (w.baseDamage + player.damageMultiplier*8)*player.damageMultiplier,
                        speed: 0.09, size: 9, name: w.name
                    });
                    w.currentCd = w.cooldownMax;
                }
                else if(w.type === 'chain') {
                    let nearest = findNearestEnemy(320);
                    if(nearest) {
                        chainLightning(nearest, (w.baseDamage + player.damageMultiplier*10)*player.damageMultiplier, w.special.bounces);
                        w.currentCd = w.cooldownMax;
                    } else w.currentCd = 5;
                }
                else if(w.type === 'aoe') {
                    let dmg = (w.baseDamage + player.damageMultiplier*15)*player.damageMultiplier;
                    for(let e of enemies) {
                        if(Math.hypot(e.x - player.x, e.y - player.y) < w.special.radius) {
                            e.health -= dmg;
                            addParticles(e.x, e.y, '#ff8844', 8);
                            if(e.health <=0) killEnemy(e, enemies.indexOf(e));
                        }
                    }
                    w.currentCd = w.cooldownMax;
                }
                else if(w.type === 'beam') {
                    let angle = Math.atan2(mouseY - player.y, mouseX - player.x);
                    let length = 350;
                    let endX = player.x + Math.cos(angle)*length;
                    let endY = player.y + Math.sin(angle)*length;
                    let dmg = (w.baseDamage + player.damageMultiplier*18)*player.damageMultiplier;
                    for(let e of enemies) {
                        let distToLine = pointToLineDistance(e.x, e.y, player.x, player.y, endX, endY);
                        if(distToLine < 20 && Math.hypot(e.x-player.x, e.y-player.y) < length) {
                            e.health -= dmg;
                            addParticles(e.x, e.y, '#ffaa55', 6);
                            if(e.health<=0) killEnemy(e, enemies.indexOf(e));
                        }
                    }
                    w.currentCd = w.cooldownMax;
                }
            }
        }
        // Update orbiting weapons
        for(let i=0;i<orbitingWeapons.length;i++) {
            let orb = orbitingWeapons[i];
            orb.angle += orb.speed;
            let x = player.x + Math.cos(orb.angle)*orb.radius;
            let y = player.y + Math.sin(orb.angle)*orb.radius;
            for(let j=0;j<enemies.length;j++) {
                let e = enemies[j];
                if(Math.hypot(x-e.x, y-e.y) < e.radius+10) {
                    e.health -= orb.damage;
                    addParticles(e.x, e.y, '#aaffcc', 5);
                    if(e.health<=0) killEnemy(e, j);
                    orbitingWeapons.splice(i,1);
                    i--; break;
                }
            }
        }
    }
    
    function pointToLineDistance(px, py, x1, y1, x2, y2) {
        let A = px - x1, B = py - y1;
        let C = x2 - x1, D = y2 - y1;
        let dot = A * C + B * D;
        let len2 = C * C + D * D;
        if(len2 === 0) return Math.hypot(px-x1, py-y1);
        let t = dot / len2;
        if(t<0) return Math.hypot(px-x1, py-y1);
        if(t>1) return Math.hypot(px-x2, py-y2);
        let projX = x1 + t*C, projY = y1 + t*D;
        return Math.hypot(px-projX, py-projY);
    }
    
    function findNearestEnemy(range) {
        let closest=null, minDist=range;
        for(let e of enemies) {
            let d=Math.hypot(e.x-player.x, e.y-player.y);
            if(d<minDist){ minDist=d; closest=e; }
        }
        return closest;
    }
    
    function chainLightning(target, damage, bounces) {
        let hitList = [target];
        let current = target;
        for(let b=0; b<bounces; b++) {
            let next = null;
            let minD = 150;
            for(let e of enemies) {
                if(!hitList.includes(e) && Math.hypot(e.x-current.x, e.y-current.y) < minD) {
                    minD = Math.hypot(e.x-current.x, e.y-current.y);
                    next = e;
                }
            }
            if(next) {
                hitList.push(next);
                next.health -= damage;
                addParticles(next.x, next.y, '#ffffaa', 6);
                if(next.health<=0) killEnemy(next, enemies.indexOf(next));
                current = next;
            } else break;
        }
        target.health -= damage;
        if(target.health<=0) killEnemy(target, enemies.indexOf(target));
    }
    
    function killEnemy(enemy, idx) {
        if(idx===-1) return;
        addParticles(enemy.x, enemy.y, '#ffaa66', 15);
        player.kills++;
        // XP based on enemy tier
        let xpValue = 10 + Math.floor(wave/2) + (enemy.isBoss? 80 : 0);
        if(enemy.tier === 2) xpValue = 25;
        if(enemy.tier === 3) xpValue = 50;
        loot.push({ x: enemy.x, y: enemy.y, type:'xp', radius: 7, value: xpValue });
        if(Math.random()<0.12) loot.push({ x: enemy.x, y: enemy.y, type:'health', radius: 8, value: 20 });
        enemies.splice(idx,1);
        updateUI();
    }
    
    // Aura system
    let auraTimer = 0;
    function updateAuras() {
        if(unlockedAuras.length===0) return;
        auraTimer--;
        if(auraTimer<=0) {
            auraTimer = 25;
            for(let aura of unlockedAuras) {
                let dmg = (aura.damage + player.damageMultiplier * 3) * player.damageMultiplier;
                for(let i=0;i<enemies.length;i++) {
                    let e = enemies[i];
                    let dist = Math.hypot(e.x-player.x, e.y-player.y);
                    if(dist < aura.range) {
                        if(aura.effect.dmg > 0 || aura.type !== 'Magnet') {
                            e.health -= dmg;
                            addParticles(e.x, e.y, '#ff9955', 3);
                            if(e.health<=0) killEnemy(e, i);
                        }
                        if(aura.effect.magnet) {
                            for(let l of loot) if(l.type==='xp') {
                                let dx = player.x-l.x, dy = player.y-l.y, len=Math.hypot(dx,dy);
                                if(len>5) { l.x += dx/len*6; l.y += dy/len*6; }
                            }
                        }
                        if(aura.effect.healPerTick) player.health = Math.min(player.maxHealth, player.health+aura.effect.healPerTick);
                        if(aura.effect.slow) e.speed = Math.max(0.5, e.speed*0.95);
                    }
                }
            }
        }
    }
    
    // Enemy spawning with tiers (higher mob more XP)
    function spawnEnemy(isBoss) {
        let side = Math.floor(Math.random()*4);
        let x,y;
        if(side===0){ x=-40; y=Math.random()*H; }
        else if(side===1){ x=W+40; y=Math.random()*H; }
        else if(side===2){ x=Math.random()*W; y=-40; }
        else { x=Math.random()*W; y=H+40; }
        let tier = 1;
        if(wave>=5 && Math.random()<0.3) tier=2;
        if(wave>=10 && Math.random()<0.2) tier=3;
        let health = (isBoss? 80 + wave*5 : 18 + wave*2) * tier;
        let speed = 1.2 + wave*0.04 + (tier*0.2);
        enemies.push({
            x, y, radius: isBoss?26:15, health, maxHealth:health, speed, isBoss:isBoss||false,
            tier: tier, color: isBoss?'#cc5555': tier===3?'#aa44aa': tier===2?'#aa8844':'#7a4c2c'
        });
    }
    
    // Wave management
    function updateWave() {
        if(!gameRunning) return;
        if(enemies.length===0 && enemiesToSpawn===0) {
            wave++;
            waveSpan.innerText = wave;
            let base = 6 + Math.floor(wave*0.6);
            if(wave % 5 === 0) { bossWave=true; enemiesToSpawn = 1; }
            else { bossWave=false; enemiesToSpawn = Math.min(base, 28); }
            waveCooldown = 25;
        }
        if(enemiesToSpawn>0 && waveCooldown<=0) {
            let isBoss = bossWave && enemiesToSpawn===1;
            spawnEnemy(isBoss);
            enemiesToSpawn--;
            waveCooldown = isBoss ? 70 : 18;
        } else waveCooldown--;
    }
    
    // Update projectiles, movement, collisions
    function updateGame() {
        if(!gameRunning) return;
        // Movement
        let dx=0,dy=0;
        if(keys['KeyW']) dy--;
        if(keys['KeyS']) dy++;
        if(keys['KeyA']) dx--;
        if(keys['KeyD']) dx++;
        if(dx||dy){ let len=Math.hypot(dx,dy); dx/=len; dy/=len; }
        player.x += dx*player.speed;
        player.y += dy*player.speed;
        player.x = Math.min(Math.max(player.x, 20), W-20);
        player.y = Math.min(Math.max(player.y, 20), H-20);
        
        // Primary attack
        if(primaryCooldown>0) primaryCooldown--;
        if(primaryCooldown===0 && gameRunning) {
            shootPrimary();
            primaryCooldown = BASE_ATTACK_DELAY;
        }
        
        updateWeapons();
        updateAuras();
        
        // Projectiles update
        for(let i=0;i<projectiles.length;i++) {
            let p = projectiles[i];
            p.x+=p.vx; p.y+=p.vy;
            if(p.x<-100||p.x>W+100||p.y<-100||p.y>H+100){ projectiles.splice(i,1); i--; continue; }
            let hit=false;
            for(let j=0;j<enemies.length;j++) {
                let e=enemies[j];
                if(Math.hypot(p.x-e.x, p.y-e.y)<e.radius+7){
                    e.health -= p.damage;
                    addParticles(p.x,p.y,'#ffee99',5);
                    if(e.health<=0) killEnemy(e,j);
                    hit=true; break;
                }
            }
            if(hit){ projectiles.splice(i,1); i--; }
        }
        
        // Enemy movement & collision
        for(let i=0;i<enemies.length;i++){
            let e=enemies[i];
            let angle=Math.atan2(player.y-e.y, player.x-e.x);
            e.x+=Math.cos(angle)*e.speed;
            e.y+=Math.sin(angle)*e.speed;
            if(Math.hypot(e.x-player.x, e.y-player.y)<player.radius+e.radius){
                if(player.invincibleFrames<=0){
                    let dmg = e.isBoss? 28 : 12;
                    player.health -= dmg;
                    player.invincibleFrames=22;
                    updateUI();
                    if(player.health<=0){ gameRunning=false; gameOver(); }
                }
                let push=Math.atan2(e.y-player.y, e.x-player.x);
                e.x+=Math.cos(push)*16;
                e.y+=Math.sin(push)*16;
            }
        }
        if(player.invincibleFrames>0) player.invincibleFrames--;
        
        // Loot collection
        for(let i=0;i<loot.length;i++){
            let l=loot[i];
            if(Math.hypot(l.x-player.x, l.y-player.y)<player.radius+8){
                if(l.type==='xp') addXP(l.value);
                else if(l.type==='health') player.health = Math.min(player.maxHealth, player.health+l.value);
                loot.splice(i,1); i--; updateUI();
            }
        }
        updateParticles();
        updateWave();
    }
    
    function addParticles(x,y,color,count){
        for(let i=0;i<count;i++){
            particles.push({ x,y, vx:(Math.random()-0.5)*4, vy:(Math.random()-0.5)*4, life:0.8, size:3, color });
        }
    }
    function updateParticles(){
        for(let i=0;i<particles.length;i++){
            let p=particles[i];
            p.x+=p.vx; p.y+=p.vy; p.life-=0.02;
            if(p.life<=0){ particles.splice(i,1); i--; }
        }
    }
    
    function gameOver(){
        gameRunning=false;
        finalWaveSpan.innerText=wave;
        finalKillsSpan.innerText=player.kills;
        gameOverPanel.classList.remove('hidden');
    }
    
    function restart(){
        gameRunning=true; upgradePending=false; upgradePanel.classList.add('hidden');
        player = {
            x: W/2, y: H/2, radius: 18,
            health: 100, maxHealth: 100,
            damageMultiplier: 1.0,
            speed: 5,
            xp: 0, level: 1,
            kills: 0, invincibleFrames: 0
        };
        unlockedWeapons = [ { ...weaponLibrary[0], currentCd: 0, name: 'Basic Bolt', baseDamage: 30, cooldownMax: 18 } ];
        unlockedAuras = [];
        enemies = []; projectiles = []; loot = []; particles = []; orbitingWeapons = [];
        wave = 1; enemiesToSpawn = 8; waveCooldown = 20; bossWave=false;
        primaryCooldown=0;
        updateUI();
        gameOverPanel.classList.add('hidden');
    }
    
    // Drawing
    function draw(){
        ctx.clearRect(0,0,W,H);
        ctx.fillStyle='#0c1020'; ctx.fillRect(0,0,W,H);
        for(let e of enemies){
            ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2);
            ctx.fillStyle=e.color; ctx.fill();
            ctx.fillStyle='white'; ctx.font='bold 14px monospace';
            ctx.fillText(`${Math.floor(e.health)}`, e.x-12, e.y-12);
        }
        for(let l of loot){
            ctx.beginPath(); ctx.arc(l.x,l.y,l.radius,0,Math.PI*2);
            ctx.fillStyle=l.type==='xp'?'#aaff88':'#ff8888'; ctx.fill();
        }
        for(let p of projectiles){
            ctx.beginPath(); ctx.arc(p.x,p.y,6,0,Math.PI*2);
            ctx.fillStyle=p.color||'#ffcc77'; ctx.fill();
        }
        for(let orb of orbitingWeapons){
            let x=player.x+Math.cos(orb.angle)*orb.radius;
            let y=player.y+Math.sin(orb.angle)*orb.radius;
            ctx.beginPath(); ctx.arc(x,y,orb.size,0,Math.PI*2);
            ctx.fillStyle='#cceeff'; ctx.fill();
        }
        // Player
        ctx.shadowBlur=8; ctx.beginPath(); ctx.arc(player.x,player.y,player.radius,0,Math.PI*2);
        ctx.fillStyle='#6ec8ff'; ctx.fill();
        ctx.fillStyle='white'; ctx.fillText(`${Math.floor(player.health)}❤️`, player.x-18, player.y-18);
        ctx.fillStyle='#ffbf77'; ctx.fillRect(player.x-32, player.y-28, 64*(player.health/player.maxHealth), 7);
        for(let a of unlockedAuras){
            ctx.beginPath(); ctx.arc(player.x,player.y,a.range,0,Math.PI*2);
            ctx.strokeStyle='#ffaa66'; ctx.setLineDash([5,12]); ctx.stroke();
        }
        ctx.setLineDash([]);
        for(let p of particles){ ctx.globalAlpha=p.life; ctx.fillStyle=p.color; ctx.fillRect(p.x-2,p.y-2,4,4); }
        ctx.globalAlpha=1;
    }
    
    const keys={ KeyW:false, KeyS:false, KeyA:false, KeyD:false };
    window.addEventListener('keydown',e=>{ if(keys.hasOwnProperty(e.code)) keys[e.code]=true; if(e.code==='KeyR') restart(); });
    window.addEventListener('keyup',e=>{ if(keys.hasOwnProperty(e.code)) keys[e.code]=false; });
    canvas.addEventListener('mousemove',e=>{ let rect=canvas.getBoundingClientRect(); mouseX=(e.clientX-rect.left)*(W/rect.width); mouseY=(e.clientY-rect.top)*(H/rect.height); });
    restartBtn.onclick=()=>restart();
    
    function animate(){
        updateGame();
        draw();
        requestAnimationFrame(animate);
    }
    restart(); // initialize
    animate();
})();
