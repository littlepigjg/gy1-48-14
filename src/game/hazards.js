import { TILE_SIZE, TILE_TYPES, EARTHQUAKE_CONFIG, SURFACE_Y, WORLD_HEIGHT } from './constants.js';
import { CollapseSystem } from './collapse.js';

export class PoisonGasCloud {
  constructor(x, y, tileX, tileY, index = 0, total = 5) {
    const angle = (index / total) * Math.PI * 2;
    const spread = TILE_SIZE * 1.5;
    this.x = x + Math.cos(angle) * spread * (0.3 + Math.random() * 0.7);
    this.y = y + Math.sin(angle) * spread * (0.3 + Math.random() * 0.7);
    this.tileX = tileX;
    this.tileY = tileY;
    this.vx = Math.cos(angle) * 0.4 + (Math.random() - 0.5) * 0.2;
    this.vy = -0.2 - Math.random() * 0.15;
    this.size = TILE_SIZE * (0.9 + Math.random() * 0.3);
    this.life = 500 + Math.random() * 300;
    this.maxLife = 800;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  update(dt, world) {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.005;
    if (this.vy > 0.2) this.vy = 0.2;

    const newTileX = Math.floor(this.x / TILE_SIZE);
    const newTileY = Math.floor(this.y / TILE_SIZE);
    if (world.isSolid(newTileX, newTileY)) {
      this.vx = -this.vx * 0.5;
      this.vy = -this.vy * 0.3;
      this.x += this.vx * 5;
      this.y += this.vy * 5;
    }
    this.tileX = newTileX;
    this.tileY = newTileY;

    if (Math.random() < 0.002) {
      this.vx += (Math.random() - 0.5) * 0.2;
    }

    this.life -= dt * 60;
    this.pulsePhase += dt * 2;
    return this.life > 0;
  }

  getDamageRadius() {
    return this.size * 0.6;
  }

  isAlive() {
    return this.life > 0;
  }
}

export class HazardManager {
  constructor() {
    this.poisonClouds = [];
    this.collapseWarnings = [];
    this.damageTimer = 0;
    this.damageInterval = 0.6;
    this.maxDamagePerTick = 3;
  }

  spawnPoisonClouds(x, y, count = 5) {
    count = Math.min(count, 5);
    for (let i = 0; i < count; i++) {
      this.poisonClouds.push(new PoisonGasCloud(
        x, y,
        Math.floor(x / TILE_SIZE),
        Math.floor(y / TILE_SIZE),
        i, count
      ));
    }
  }

  addCollapseWarning(tileX, tileY) {
    this.collapseWarnings.push({
      tileX,
      tileY,
      timer: 60,
      phase: 0
    });
  }

  update(dt, world, player, onDamage) {
    const clouds = this.poisonClouds;

    for (let i = clouds.length - 1; i >= 0; i--) {
      const cloud = clouds[i];

      let repelX = 0;
      let repelY = 0;
      for (let j = 0; j < clouds.length; j++) {
        if (i === j) continue;
        const other = clouds[j];
        const dx = cloud.x - other.x;
        const dy = cloud.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = TILE_SIZE * 0.8;
        if (dist < minDist && dist > 0.1) {
          const force = (minDist - dist) / minDist * 0.3;
          repelX += (dx / dist) * force;
          repelY += (dy / dist) * force;
        }
      }
      cloud.vx += repelX;
      cloud.vy += repelY;

      const maxSpeed = 0.8;
      const speed = Math.sqrt(cloud.vx * cloud.vx + cloud.vy * cloud.vy);
      if (speed > maxSpeed) {
        cloud.vx = (cloud.vx / speed) * maxSpeed;
        cloud.vy = (cloud.vy / speed) * maxSpeed;
      }

      if (!cloud.update(dt, world)) {
        clouds.splice(i, 1);
        continue;
      }
    }

    this.damageTimer += dt;
    if (this.damageTimer >= this.damageInterval) {
      this.damageTimer = 0;

      let totalIntensity = 0;
      for (const cloud of clouds) {
        const dx = player.x - cloud.x;
        const dy = player.y - cloud.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < cloud.getDamageRadius()) {
          const intensity = 1 - dist / cloud.getDamageRadius();
          totalIntensity += intensity;
        }
      }

      if (totalIntensity > 0) {
        const damage = Math.min(this.maxDamagePerTick, totalIntensity * 2);
        if (damage > 0.1) {
          onDamage('poison', damage);
        }
      }
    }

    for (let i = this.collapseWarnings.length - 1; i >= 0; i--) {
      const w = this.collapseWarnings[i];
      w.timer -= dt * 60;
      w.phase += dt * 10;
      if (w.timer <= 0) {
        this.collapseWarnings.splice(i, 1);
      }
    }
  }

  getTotalPoisonDamage(dt = 0) {
    return this.poisonClouds.length > 0 ? 0.5 * dt : 0;
  }

  render(ctx, worldToScreen) {
    for (const cloud of this.poisonClouds) {
      const screen = worldToScreen(cloud.x, cloud.y);
      const alpha = Math.min(0.5, (cloud.life / cloud.maxLife) * 0.6);
      const pulse = 1 + Math.sin(cloud.pulsePhase) * 0.1;
      const size = cloud.size * pulse;

      const gradient = ctx.createRadialGradient(
        screen.x, screen.y, 0,
        screen.x, screen.y, size / 2
      );
      gradient.addColorStop(0, `rgba(124, 252, 0, ${alpha})`);
      gradient.addColorStop(0.5, `rgba(144, 238, 144, ${alpha * 0.6})`);
      gradient.addColorStop(1, `rgba(50, 205, 50, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const w of this.collapseWarnings) {
      const screen = worldToScreen(w.tileX * TILE_SIZE, w.tileY * TILE_SIZE);
      const alpha = Math.min(1, w.timer / 30) * (0.5 + Math.sin(w.phase) * 0.5);

      ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(screen.x + 2, screen.y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

      ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠', screen.x + TILE_SIZE / 2, screen.y + TILE_SIZE / 2 + 6);
    }
  }

  clear() {
    this.poisonClouds = [];
    this.collapseWarnings = [];
  }
}

export class EarthquakeManager {
  constructor() {
    this.state = 'idle';
    this.timer = 0;
    this.duration = 0;
    this.intensity = 0;
    this.warningTime = 0;
    this.currentWarningTime = 0;
    this.flashPhase = 0;
    this.collapseTimer = 0;
    this.damageTimer = 0;
    this.enemiesEnraged = false;
    this.enrageTimer = 0;
    this.collapseSystem = new CollapseSystem();
  }

  getIntervalForDepth(depth) {
    const maxDepth = WORLD_HEIGHT - SURFACE_Y;
    const depthRatio = Math.min(1, depth / maxDepth);
    const interval = EARTHQUAKE_CONFIG.BASE_INTERVAL - 
      (EARTHQUAKE_CONFIG.BASE_INTERVAL - EARTHQUAKE_CONFIG.MIN_INTERVAL) * depthRatio;
    return interval;
  }

  getWarningTime(seismicDetectorLevel) {
    return EARTHQUAKE_CONFIG.WARNING_BASE_TIME + 
      seismicDetectorLevel * EARTHQUAKE_CONFIG.WARNING_EXTENDED_TIME / 3;
  }

  getDamage(baseDamage, shockAbsorberLevel) {
    const reduction = shockAbsorberLevel * 0.2;
    return baseDamage * (1 - reduction);
  }

  getDuration(depth) {
    const maxDepth = WORLD_HEIGHT - SURFACE_Y;
    const depthRatio = Math.min(1, depth / maxDepth);
    return EARTHQUAKE_CONFIG.BASE_DURATION + 
      (EARTHQUAKE_CONFIG.MAX_DURATION - EARTHQUAKE_CONFIG.BASE_DURATION) * depthRatio;
  }

  update(dt, world, player, enemies, onCollapse, onDamage, onStateChange) {
    const depth = Math.max(0, player.tileY - SURFACE_Y);
    
    if (depth < EARTHQUAKE_CONFIG.MIN_DEPTH_FOR_EARTHQUAKE) {
      this.state = 'idle';
      this.timer = 0;
      this.enemiesEnraged = false;
      return;
    }

    this.flashPhase += dt * 8;

    if (this.enemiesEnraged) {
      this.enrageTimer -= dt;
      if (this.enrageTimer <= 0) {
        this.enemiesEnraged = false;
        this.calmEnemies(enemies);
      }
    }

    switch (this.state) {
      case 'idle':
        this.timer += dt;
        const interval = this.getIntervalForDepth(depth);
        if (this.timer >= interval) {
          this.startWarning(player.upgrades.seismic_detector || 0, depth, onStateChange);
        }
        break;

      case 'warning':
        this.timer += dt;
        this.currentWarningTime = Math.max(0, this.warningTime - this.timer);
        if (this.timer >= this.warningTime) {
          this.startEarthquake(depth, enemies, onStateChange);
        }
        break;

      case 'active':
        this.timer += dt;
        this.intensity = Math.sin(this.timer * 3) * 0.5 + 0.5;

        this.collapseTimer += dt;
        if (this.collapseTimer >= 0.3) {
          this.collapseTimer = 0;
          this.triggerEarthquakeCollapses(world, player, onCollapse);
        }

        this.damageTimer += dt;
        if (this.damageTimer >= 1) {
          this.damageTimer = 0;
          const damage = this.getDamage(
            EARTHQUAKE_CONFIG.BASE_DAMAGE * this.intensity,
            player.upgrades.shock_absorber || 0
          );
          if (damage > 0) {
            onDamage('earthquake', damage);
          }
        }

        if (this.timer >= this.duration) {
          this.endEarthquake(onStateChange);
        }
        break;
    }
  }

  startWarning(seismicLevel, depth, onStateChange) {
    this.state = 'warning';
    this.timer = 0;
    this.warningTime = this.getWarningTime(seismicLevel);
    this.currentWarningTime = this.warningTime;
    this.intensity = 0.3 + (depth / (WORLD_HEIGHT - SURFACE_Y)) * 0.4;
    if (onStateChange) onStateChange('warning', this.warningTime);
  }

  startEarthquake(depth, enemies, onStateChange) {
    this.state = 'active';
    this.timer = 0;
    this.duration = this.getDuration(depth);
    this.collapseTimer = 0;
    this.damageTimer = 0;
    this.enemiesEnraged = true;
    this.enrageTimer = this.duration + EARTHQUAKE_CONFIG.ENRAGE_DURATION;
    this.angerEnemies(enemies);
    if (onStateChange) onStateChange('active', this.duration);
  }

  endEarthquake(onStateChange) {
    this.state = 'idle';
    this.timer = 0;
    this.intensity = 0;
    this.currentWarningTime = 0;
    if (onStateChange) onStateChange('idle', 0);
  }

  angerEnemies(enemies) {
    for (const e of enemies.enemies) {
      e.enraged = true;
      e.originalSpeed = e.speed;
      e.originalDamage = e.damage;
      e.speed *= EARTHQUAKE_CONFIG.ENRAGE_SPEED_MULTIPLIER;
      e.damage *= EARTHQUAKE_CONFIG.ENRAGE_DAMAGE_MULTIPLIER;
    }
  }

  calmEnemies(enemies) {
    for (const e of enemies.enemies) {
      if (e.enraged) {
        e.enraged = false;
        e.speed = e.originalSpeed || e.speed;
        e.damage = e.originalDamage || e.damage;
      }
    }
  }

  triggerEarthquakeCollapses(world, player, onCollapse) {
    const collapses = this.collapseSystem.checkArea(
      player.tileX, player.tileY, 8, world, {
        earthquake: true,
        earthquakeIntensity: this.intensity,
        shockAbsorberLevel: player.upgrades.shock_absorber || 0
      }
    );

    for (const c of collapses) {
      this.collapseSystem.triggerChainReaction(
        c.x, c.y, world,
        (x, y, chainLevel) => {
          if (onCollapse) {
            onCollapse(x, y, true);
          }
        },
        {
          maxChainLevel: 4,
          delayPerLevel: 100,
          earthquake: true,
          earthquakeIntensity: this.intensity
        }
      );
    }

    if (Math.random() < EARTHQUAKE_CONFIG.TERRAIN_CHANGE_CHANCE * this.intensity) {
      this.alterTerrain(world, player);
    }
  }

  alterTerrain(world, player) {
    const radius = 5;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = player.tileX + dx;
        const ty = player.tileY + dy;
        
        if (!world.inBounds(tx, ty)) continue;
        if (ty < SURFACE_Y + 1) continue;
        
        const tile = world.getTile(tx, ty);
        if (tile === TILE_TYPES.BEDROCK || tile === TILE_TYPES.LAVA) continue;
        
        if (tile !== TILE_TYPES.EMPTY && tile !== TILE_TYPES.CAVE) {
          if (Math.random() < 0.02) {
            world.setTile(tx, ty, TILE_TYPES.INSTABILITY);
          }
        } else if ((tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.CAVE) && Math.random() < 0.01) {
          world.setTile(tx, ty, TILE_TYPES.STONE);
        }
      }
    }
  }

  getFlashAlpha() {
    if (this.state === 'warning') {
      const pulseSpeed = 3 + (1 - this.currentWarningTime / this.warningTime) * 5;
      return (Math.sin(this.flashPhase * pulseSpeed) * 0.5 + 0.5) * 0.4;
    }
    if (this.state === 'active') {
      return (Math.sin(this.flashPhase * 10) * 0.5 + 0.5) * 0.3 * this.intensity;
    }
    return 0;
  }

  isWarning() {
    return this.state === 'warning';
  }

  isActive() {
    return this.state === 'active';
  }

  getShakeIntensity() {
    if (this.state === 'active') {
      return this.intensity * 4;
    }
    if (this.state === 'warning') {
      return (1 - this.currentWarningTime / this.warningTime) * 1.5;
    }
    return 0;
  }

  render(ctx, screenWidth, screenHeight) {
    const alpha = this.getFlashAlpha();
    if (alpha > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.fillRect(0, 0, screenWidth, screenHeight);
    }

    if (this.state === 'warning' || this.state === 'active') {
      const centerX = screenWidth / 2;
      const centerY = 80;
      
      ctx.save();
      ctx.shadowColor = '#FF0000';
      ctx.shadowBlur = 20;
      
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      
      let text = '';
      if (this.state === 'warning') {
        text = `⚠️ 地震预警！${this.currentWarningTime.toFixed(1)}秒后发生 ⚠️`;
      } else {
        text = `🌋 地震中！ ${Math.max(0, this.duration - this.timer).toFixed(1)}秒 🌋`;
      }
      
      const pulse = 1 + Math.sin(this.flashPhase * 3) * 0.1;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(pulse, pulse);
      ctx.fillText(text, 0, 0);
      ctx.restore();
      
      ctx.restore();

      const barWidth = 300;
      const barHeight = 8;
      const barX = centerX - barWidth / 2;
      const barY = centerY + 20;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      let progress;
      if (this.state === 'warning') {
        progress = 1 - this.currentWarningTime / this.warningTime;
      } else {
        progress = this.timer / this.duration;
      }
      
      const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      gradient.addColorStop(0, '#FF6600');
      gradient.addColorStop(0.5, '#FF0000');
      gradient.addColorStop(1, '#FF6600');
      ctx.fillStyle = gradient;
      ctx.fillRect(barX, barY, barWidth * progress, barHeight);
    }
  }

  clear() {
    this.state = 'idle';
    this.timer = 0;
    this.duration = 0;
    this.intensity = 0;
    this.warningTime = 0;
    this.currentWarningTime = 0;
    this.enemiesEnraged = false;
    this.enrageTimer = 0;
    this.collapseSystem.clear();
  }
}
