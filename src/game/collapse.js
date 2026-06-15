import { TILE_SIZE, TILE_TYPES, SURFACE_Y } from './constants.js';

export const COLLAPSE_CONFIG = {
  NO_BOTTOM_SUPPORT_BASE_CHANCE: 0.35,
  SIDE_BOTH_SUPPORT_REDUCTION: 0.35,
  SIDE_ONE_SUPPORT_REDUCTION: 0.55,
  SIDE_NONE_SUPPORT_REDUCTION: 0.85,
  EARTHQUAKE_BASE_CHANCE: 0.6,
  EARTHQUAKE_SIDE_BOTH_SUPPORT_REDUCTION: 0.55,
  EARTHQUAKE_SIDE_ONE_SUPPORT_REDUCTION: 0.75,
  EARTHQUAKE_SIDE_NONE_SUPPORT_REDUCTION: 0.95,
  EARTHQUAKE_MIN_CHANCE: 0.25,
  CHAIN_REACTION_CHANCE: 0.4,
  MAX_CHAIN_LEVEL: 4,
  INSTABILITY_CHANCE_BONUS: 0.25,
  SHOCK_ABSORBER_REDUCTION_PER_LEVEL: 0.12
};

export class CollapseSystem {
  constructor() {
    this.pendingCollapses = [];
    this.processedTiles = new Set();
  }

  canCollapse(x, y, world) {
    if (!world.inBounds(x, y)) return false;
    if (y < SURFACE_Y + 1) return false;
    
    const tile = world.getTile(x, y);
    if (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.CAVE ||
        tile === TILE_TYPES.BEDROCK || tile === TILE_TYPES.LAVA) {
      return false;
    }
    
    const below = world.getTile(x, y + 1);
    return below === TILE_TYPES.EMPTY || below === TILE_TYPES.CAVE;
  }

  getCollapseChance(x, y, world, options = {}) {
    const { 
      earthquake = false, 
      earthquakeIntensity = 1,
      shockAbsorberLevel = 0 
    } = options;

    if (!this.canCollapse(x, y, world)) return 0;

    const support = checkSupportStatus(x, y, world);

    if (support.hasBottomSupport) {
      return 0;
    }

    let chance;
    if (earthquake) {
      chance = COLLAPSE_CONFIG.EARTHQUAKE_BASE_CHANCE * earthquakeIntensity;
      
      if (support.leftBelow && support.rightBelow) {
        chance *= COLLAPSE_CONFIG.EARTHQUAKE_SIDE_BOTH_SUPPORT_REDUCTION;
      } else if (support.leftBelow || support.rightBelow) {
        chance *= COLLAPSE_CONFIG.EARTHQUAKE_SIDE_ONE_SUPPORT_REDUCTION;
      } else {
        chance *= COLLAPSE_CONFIG.EARTHQUAKE_SIDE_NONE_SUPPORT_REDUCTION;
      }
      
      chance = Math.max(COLLAPSE_CONFIG.EARTHQUAKE_MIN_CHANCE, chance);
    } else {
      chance = COLLAPSE_CONFIG.NO_BOTTOM_SUPPORT_BASE_CHANCE;
      
      if (support.leftBelow && support.rightBelow) {
        chance *= COLLAPSE_CONFIG.SIDE_BOTH_SUPPORT_REDUCTION;
      } else if (support.leftBelow || support.rightBelow) {
        chance *= COLLAPSE_CONFIG.SIDE_ONE_SUPPORT_REDUCTION;
      } else {
        chance *= COLLAPSE_CONFIG.SIDE_NONE_SUPPORT_REDUCTION;
      }
    }

    const tile = world.getTile(x, y);
    if (tile === TILE_TYPES.INSTABILITY) {
      chance += COLLAPSE_CONFIG.INSTABILITY_CHANCE_BONUS;
    }

    const reduction = shockAbsorberLevel * COLLAPSE_CONFIG.SHOCK_ABSORBER_REDUCTION_PER_LEVEL;
    chance *= (1 - reduction);

    return Math.min(1, Math.max(0, chance));
  }

  checkArea(centerX, centerY, radius, world, options = {}) {
    const collapses = [];
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        if (!this.canCollapse(x, y, world)) continue;
        
        const chance = this.getCollapseChance(x, y, world, options);
        if (Math.random() < chance) {
          collapses.push({ x, y, chainLevel: 0 });
        }
      }
    }
    
    return collapses;
  }

  checkColumn(x, y, world, options = {}) {
    const collapses = [];
    
    for (let dy = -2; dy <= 0; dy++) {
      const checkY = y + dy;
      if (this.canCollapse(x, checkY, world)) {
        const chance = this.getCollapseChance(x, checkY, world, options);
        if (Math.random() < chance) {
          collapses.push({ x, y: checkY, chainLevel: 0 });
        }
      }
    }
    
    return collapses;
  }

  triggerChainReaction(startX, startY, world, onCollapse, options = {}) {
    const { 
      maxChainLevel = COLLAPSE_CONFIG.MAX_CHAIN_LEVEL,
      delayPerLevel = 150,
      earthquake = false,
      earthquakeIntensity = 1
    } = options;

    const processed = new Set();
    const queue = [{ x: startX, y: startY, chainLevel: 0 }];
    const results = [];

    const processNext = () => {
      if (queue.length === 0) return;
      
      const current = queue.shift();
      const key = `${current.x},${current.y}`;
      
      if (processed.has(key)) {
        processNext();
        return;
      }
      processed.add(key);
      
      if (!this.canCollapse(current.x, current.y, world)) {
        processNext();
        return;
      }

      let shouldCollapse = current.chainLevel === 0;
      if (!shouldCollapse) {
        const chance = this.getCollapseChance(current.x, current.y, world, {
          earthquake,
          earthquakeIntensity
        }) * COLLAPSE_CONFIG.CHAIN_REACTION_CHANCE;
        shouldCollapse = Math.random() < chance;
      }
      
      if (shouldCollapse) {
        results.push({ x: current.x, y: current.y, chainLevel: current.chainLevel });
        if (onCollapse) {
          onCollapse(current.x, current.y, current.chainLevel);
        }
        
        if (current.chainLevel < maxChainLevel) {
          const neighbors = [
            { dx: 0, dy: -1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 },
            { dx: -1, dy: -1 },
            { dx: 1, dy: -1 },
            { dx: -2, dy: 0 },
            { dx: 2, dy: 0 }
          ];
          
          for (const n of neighbors) {
            const nx = current.x + n.dx;
            const ny = current.y + n.dy;
            const nkey = `${nx},${ny}`;
            
            if (!processed.has(nkey) && this.canCollapse(nx, ny, world)) {
              queue.push({ x: nx, y: ny, chainLevel: current.chainLevel + 1 });
            }
          }
        }
      }
      
      if (queue.length > 0) {
        setTimeout(processNext, delayPerLevel / (current.chainLevel + 1));
      }
    };

    processNext();
    return results;
  }

  doCollapse(x, y, world) {
    if (!world.inBounds(x, y)) return null;
    
    const tile = world.getTile(x, y);
    if (tile === TILE_TYPES.BEDROCK || tile === TILE_TYPES.EMPTY || 
        tile === TILE_TYPES.CAVE || tile === TILE_TYPES.LAVA) {
      return null;
    }

    const idx = world.getIndex(x, y);
    const tileType = tile;
    world.tiles[idx] = TILE_TYPES.EMPTY;
    world.tileHealth[idx] = 0;
    world.dugTiles[idx] = 1;

    return { x, y, tileType };
  }

  getDamageAt(x, y, playerX, playerY) {
    const dx = (x + 0.5) * TILE_SIZE - playerX;
    const dy = (y + 0.5) * TILE_SIZE - playerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < TILE_SIZE * 1.8) {
      return dist < TILE_SIZE ? 20 : 10;
    }
    return 0;
  }

  getDustColor(tileType, tileColors) {
    const colors = tileColors[tileType];
    if (colors && colors.length > 0) return colors[0];
    return '#8B4513';
  }

  clear() {
    this.pendingCollapses = [];
    this.processedTiles.clear();
  }
}

export function checkSupportStatus(x, y, world) {
  const below = world.getTile(x, y + 1);
  const hasBottomSupport = below !== TILE_TYPES.EMPTY && below !== TILE_TYPES.CAVE;
  
  const leftBelow = world.isSolid(x - 1, y + 1);
  const rightBelow = world.isSolid(x + 1, y + 1);
  
  let supportLevel = 0;
  if (hasBottomSupport) {
    supportLevel = 3;
  } else if (leftBelow && rightBelow) {
    supportLevel = 2;
  } else if (leftBelow || rightBelow) {
    supportLevel = 1;
  }
  
  return {
    hasBottomSupport,
    leftBelow,
    rightBelow,
    supportLevel
  };
}
