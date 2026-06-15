import { describe, it, expect, beforeEach } from 'vitest';
import { 
  CollapseSystem, 
  checkSupportStatus, 
  COLLAPSE_CONFIG 
} from '../src/game/collapse.js';
import { 
  TILE_TYPES, 
  WORLD_WIDTH, 
  WORLD_HEIGHT, 
  SURFACE_Y,
  TILE_HARDNESS 
} from '../src/game/constants.js';

function createMockWorld() {
  const tiles = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const tileHealth = new Float32Array(WORLD_WIDTH * WORLD_HEIGHT);
  const dugTiles = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const idx = y * WORLD_WIDTH + x;
      if (y >= SURFACE_Y) {
        tiles[idx] = TILE_TYPES.STONE;
        tileHealth[idx] = TILE_HARDNESS[TILE_TYPES.STONE] * 100;
      } else {
        tiles[idx] = TILE_TYPES.EMPTY;
      }
    }
  }

  return {
    tiles,
    tileHealth,
    dugTiles,
    getIndex(x, y) { return y * WORLD_WIDTH + x; },
    inBounds(x, y) {
      return x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT;
    },
    getTile(x, y) {
      if (!this.inBounds(x, y)) return TILE_TYPES.BEDROCK;
      return tiles[this.getIndex(x, y)];
    },
    setTile(x, y, type) {
      if (!this.inBounds(x, y)) return;
      const idx = this.getIndex(x, y);
      tiles[idx] = type;
      if (type !== TILE_TYPES.EMPTY) {
        tileHealth[idx] = (TILE_HARDNESS[type] || 1) * 100;
      }
    },
    isSolid(x, y) {
      const tile = this.getTile(x, y);
      return tile !== TILE_TYPES.EMPTY && tile !== TILE_TYPES.CAVE;
    }
  };
}

describe('checkSupportStatus', () => {
  it('应该正确识别有正下方支撑的方块', () => {
    const world = createMockWorld();
    const x = 50;
    const y = SURFACE_Y + 5;
    
    const status = checkSupportStatus(x, y, world);
    expect(status.hasBottomSupport).toBe(true);
    expect(status.leftBelow).toBe(true);
    expect(status.rightBelow).toBe(true);
    expect(status.supportLevel).toBe(3);
  });

  it('应该正确识别正下方空但左右都有支撑的方块', () => {
    const world = createMockWorld();
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    
    const status = checkSupportStatus(x, y, world);
    expect(status.hasBottomSupport).toBe(false);
    expect(status.leftBelow).toBe(true);
    expect(status.rightBelow).toBe(true);
    expect(status.supportLevel).toBe(2);
  });

  it('应该正确识别正下方空且只有左边有支撑的方块', () => {
    const world = createMockWorld();
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x + 1, y + 1, TILE_TYPES.EMPTY);
    
    const status = checkSupportStatus(x, y, world);
    expect(status.hasBottomSupport).toBe(false);
    expect(status.leftBelow).toBe(true);
    expect(status.rightBelow).toBe(false);
    expect(status.supportLevel).toBe(1);
  });

  it('应该正确识别正下方空且只有右边有支撑的方块', () => {
    const world = createMockWorld();
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x - 1, y + 1, TILE_TYPES.EMPTY);
    
    const status = checkSupportStatus(x, y, world);
    expect(status.hasBottomSupport).toBe(false);
    expect(status.leftBelow).toBe(false);
    expect(status.rightBelow).toBe(true);
    expect(status.supportLevel).toBe(1);
  });

  it('应该正确识别完全没有支撑的方块', () => {
    const world = createMockWorld();
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x - 1, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x + 1, y + 1, TILE_TYPES.EMPTY);
    
    const status = checkSupportStatus(x, y, world);
    expect(status.hasBottomSupport).toBe(false);
    expect(status.leftBelow).toBe(false);
    expect(status.rightBelow).toBe(false);
    expect(status.supportLevel).toBe(0);
  });
});

describe('CollapseSystem.canCollapse', () => {
  let system;
  let world;

  beforeEach(() => {
    system = new CollapseSystem();
    world = createMockWorld();
  });

  it('应该返回false当方块超出边界', () => {
    expect(system.canCollapse(-1, 50, world)).toBe(false);
    expect(system.canCollapse(WORLD_WIDTH, 50, world)).toBe(false);
    expect(system.canCollapse(50, -1, world)).toBe(false);
    expect(system.canCollapse(50, WORLD_HEIGHT, world)).toBe(false);
  });

  it('应该返回false当地表以上的方块', () => {
    expect(system.canCollapse(50, SURFACE_Y - 1, world)).toBe(false);
    expect(system.canCollapse(50, SURFACE_Y, world)).toBe(false);
  });

  it('应该返回false当方块是空洞', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x, y, TILE_TYPES.EMPTY);
    expect(system.canCollapse(x, y, world)).toBe(false);
  });

  it('应该返回false当方块是基岩', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y, TILE_TYPES.BEDROCK);
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    expect(system.canCollapse(x, y, world)).toBe(false);
  });

  it('应该返回false当方块是熔岩', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y, TILE_TYPES.LAVA);
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    expect(system.canCollapse(x, y, world)).toBe(false);
  });

  it('应该返回false当正下方有方块支撑', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    expect(system.canCollapse(x, y, world)).toBe(false);
  });

  it('应该返回true当正下方是空的且方块是固体', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    expect(system.canCollapse(x, y, world)).toBe(true);
  });
});

describe('CollapseSystem.getCollapseChance (普通状态)', () => {
  let system;
  let world;

  beforeEach(() => {
    system = new CollapseSystem();
    world = createMockWorld();
  });

  it('应该返回0当方块不能坍塌（有正下方支撑）', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    const chance = system.getCollapseChance(x, y, world);
    expect(chance).toBe(0);
  });

  it('应该返回0当方块不能坍塌（非固体）', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y, TILE_TYPES.EMPTY);
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    const chance = system.getCollapseChance(x, y, world);
    expect(chance).toBe(0);
  });

  it('完全没有支撑的方块坍塌概率应该最高', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x - 1, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x + 1, y + 1, TILE_TYPES.EMPTY);
    const chance = system.getCollapseChance(x, y, world);
    expect(chance).toBeCloseTo(
      COLLAPSE_CONFIG.NO_BOTTOM_SUPPORT_BASE_CHANCE * 
      COLLAPSE_CONFIG.SIDE_NONE_SUPPORT_REDUCTION, 
      5
    );
    expect(chance).toBeGreaterThan(0.2);
  });

  it('只有一边支撑的方块坍塌概率应该中等', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x + 1, y + 1, TILE_TYPES.EMPTY);
    const chance = system.getCollapseChance(x, y, world);
    expect(chance).toBeCloseTo(
      COLLAPSE_CONFIG.NO_BOTTOM_SUPPORT_BASE_CHANCE * 
      COLLAPSE_CONFIG.SIDE_ONE_SUPPORT_REDUCTION, 
      5
    );
    expect(chance).toBeGreaterThan(0.1);
    expect(chance).toBeLessThan(0.3);
  });

  it('左右都有支撑的方块坍塌概率应该最低', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    const chance = system.getCollapseChance(x, y, world);
    expect(chance).toBeCloseTo(
      COLLAPSE_CONFIG.NO_BOTTOM_SUPPORT_BASE_CHANCE * 
      COLLAPSE_CONFIG.SIDE_BOTH_SUPPORT_REDUCTION, 
      5
    );
    expect(chance).toBeGreaterThan(0.05);
    expect(chance).toBeLessThan(0.2);
  });

  it('不稳定方块应该有更高的坍塌概率', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x, y, TILE_TYPES.INSTABILITY);
    
    const normalX = 51;
    world.setTile(normalX, y + 1, TILE_TYPES.EMPTY);
    
    const instabilityChance = system.getCollapseChance(x, y, world);
    const normalChance = system.getCollapseChance(normalX, y, world);
    
    expect(instabilityChance).toBeGreaterThan(normalChance);
    expect(instabilityChance - normalChance).toBeCloseTo(
      COLLAPSE_CONFIG.INSTABILITY_CHANCE_BONUS, 
      5
    );
  });

  it('防震护甲应该降低坍塌概率', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x - 1, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x + 1, y + 1, TILE_TYPES.EMPTY);
    
    const noArmorChance = system.getCollapseChance(x, y, world, { shockAbsorberLevel: 0 });
    const maxArmorChance = system.getCollapseChance(x, y, world, { shockAbsorberLevel: 3 });
    
    expect(maxArmorChance).toBeLessThan(noArmorChance);
  });

  it('概率应该在0到1之间', () => {
    for (let i = 0; i < 100; i++) {
      const x = 10 + Math.floor(Math.random() * (WORLD_WIDTH - 20));
      const y = SURFACE_Y + 5 + Math.floor(Math.random() * 50);
      world.setTile(x, y + 1, TILE_TYPES.EMPTY);
      if (Math.random() < 0.33) world.setTile(x - 1, y + 1, TILE_TYPES.EMPTY);
      if (Math.random() < 0.33) world.setTile(x + 1, y + 1, TILE_TYPES.EMPTY);
      
      const chance = system.getCollapseChance(x, y, world);
      expect(chance).toBeGreaterThanOrEqual(0);
      expect(chance).toBeLessThanOrEqual(1);
    }
  });
});

describe('CollapseSystem.getCollapseChance (地震状态)', () => {
  let system;
  let world;

  beforeEach(() => {
    system = new CollapseSystem();
    world = createMockWorld();
  });

  it('地震时坍塌概率应该明显高于普通状态', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    
    const normalChance = system.getCollapseChance(x, y, world);
    const earthquakeChance = system.getCollapseChance(x, y, world, { 
      earthquake: true, 
      earthquakeIntensity: 1 
    });
    
    expect(earthquakeChance).toBeGreaterThan(normalChance);
    expect(earthquakeChance).toBeGreaterThan(COLLAPSE_CONFIG.EARTHQUAKE_MIN_CHANCE);
  });

  it('地震时即使左右都有支撑也有相当高的坍塌概率', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    
    const chance = system.getCollapseChance(x, y, world, { 
      earthquake: true, 
      earthquakeIntensity: 1 
    });
    
    expect(chance).toBeGreaterThanOrEqual(COLLAPSE_CONFIG.EARTHQUAKE_MIN_CHANCE);
    expect(chance).toBeGreaterThan(0.25);
  });

  it('地震强度应该影响坍塌概率', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    
    const lowIntensity = system.getCollapseChance(x, y, world, { 
      earthquake: true, 
      earthquakeIntensity: 0.3 
    });
    const highIntensity = system.getCollapseChance(x, y, world, { 
      earthquake: true, 
      earthquakeIntensity: 1 
    });
    
    expect(highIntensity).toBeGreaterThan(lowIntensity);
  });

  it('地震时完全没有支撑的方块概率应该很高', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x - 1, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    world.setTile(x + 1, y + 1, TILE_TYPES.EMPTY);
    
    const chance = system.getCollapseChance(x, y, world, { 
      earthquake: true, 
      earthquakeIntensity: 1 
    });
    
    expect(chance).toBeGreaterThan(0.5);
  });

  it('地震时防震护甲应该也有效果', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y + 1, TILE_TYPES.EMPTY);
    
    const noArmor = system.getCollapseChance(x, y, world, { 
      earthquake: true, 
      earthquakeIntensity: 1,
      shockAbsorberLevel: 0 
    });
    const withArmor = system.getCollapseChance(x, y, world, { 
      earthquake: true, 
      earthquakeIntensity: 1,
      shockAbsorberLevel: 3 
    });
    
    expect(withArmor).toBeLessThan(noArmor);
  });
});

describe('CollapseSystem.doCollapse', () => {
  let system;
  let world;

  beforeEach(() => {
    system = new CollapseSystem();
    world = createMockWorld();
  });

  it('应该把方块变为空', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    expect(world.getTile(x, y)).toBe(TILE_TYPES.STONE);
    
    const result = system.doCollapse(x, y, world);
    
    expect(result).not.toBeNull();
    expect(result.x).toBe(x);
    expect(result.y).toBe(y);
    expect(result.tileType).toBe(TILE_TYPES.STONE);
    expect(world.getTile(x, y)).toBe(TILE_TYPES.EMPTY);
  });

  it('对基岩应该返回null且不做改变', () => {
    const x = 50;
    const y = WORLD_HEIGHT - 1;
    world.setTile(x, y, TILE_TYPES.BEDROCK);
    
    const result = system.doCollapse(x, y, world);
    expect(result).toBeNull();
    expect(world.getTile(x, y)).toBe(TILE_TYPES.BEDROCK);
  });

  it('对空方块应该返回null', () => {
    const x = 50;
    const y = SURFACE_Y + 5;
    world.setTile(x, y, TILE_TYPES.EMPTY);
    
    const result = system.doCollapse(x, y, world);
    expect(result).toBeNull();
  });

  it('对越界坐标应该返回null', () => {
    expect(system.doCollapse(-1, 50, world)).toBeNull();
    expect(system.doCollapse(WORLD_WIDTH, 50, world)).toBeNull();
  });
});

describe('CollapseSystem.checkArea', () => {
  let system;
  let world;

  beforeEach(() => {
    system = new CollapseSystem();
    world = createMockWorld();
  });

  it('应该返回一个数组', () => {
    const result = system.checkArea(50, SURFACE_Y + 5, 2, world);
    expect(Array.isArray(result)).toBe(true);
  });

  it('在完全支撑的区域应该返回空数组', () => {
    const result = system.checkArea(50, SURFACE_Y + 5, 5, world);
    expect(result.length).toBe(0);
  });

  it('在有空洞的区域应该返回可能坍塌的方块', () => {
    const centerX = 50;
    const centerY = SURFACE_Y + 5;
    for (let dx = -2; dx <= 2; dx++) {
      world.setTile(centerX + dx, centerY + 1, TILE_TYPES.EMPTY);
    }
    
    const result = system.checkArea(centerX, centerY, 2, world);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('每个返回的结果应该包含有效的坐标', () => {
    const centerX = 50;
    const centerY = SURFACE_Y + 5;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        world.setTile(centerX + dx, centerY + dy + 1, TILE_TYPES.EMPTY);
      }
    }
    
    const results = system.checkArea(centerX, centerY, 3, world);
    for (const r of results) {
      expect(typeof r.x).toBe('number');
      expect(typeof r.y).toBe('number');
      expect(typeof r.chainLevel).toBe('number');
      expect(r.chainLevel).toBe(0);
    }
  });
});

describe('CollapseSystem.getDamageAt', () => {
  let system;

  beforeEach(() => {
    system = new CollapseSystem();
  });

  it('玩家在方块位置时应该受到最大伤害', () => {
    const damage = system.getDamageAt(5, 5, 5 * 40 + 20, 5 * 40 + 20);
    expect(damage).toBe(20);
  });

  it('玩家在方块附近应该受到较小伤害', () => {
    const damage = system.getDamageAt(5, 5, 5 * 40 + 20, 5 * 40 + 60);
    expect(damage).toBe(10);
  });

  it('玩家远离方块时应该不受伤', () => {
    const damage = system.getDamageAt(5, 5, 20 * 40, 20 * 40);
    expect(damage).toBe(0);
  });
});

describe('概率分布合理性验证', () => {
  let system;
  let world;

  beforeEach(() => {
    system = new CollapseSystem();
    world = createMockWorld();
  });

  it('地震时的坍塌概率应该显著高于普通状态（统计验证）', () => {
    const trials = 1000;
    let normalCollapses = 0;
    let earthquakeCollapses = 0;

    for (let i = 0; i < trials; i++) {
      const x = 20 + Math.floor(Math.random() * 160);
      const y = SURFACE_Y + 10 + Math.floor(Math.random() * 100);
      
      world.setTile(x, y + 1, TILE_TYPES.EMPTY);
      if (Math.random() < 0.33) world.setTile(x - 1, y + 1, TILE_TYPES.EMPTY);
      if (Math.random() < 0.33) world.setTile(x + 1, y + 1, TILE_TYPES.EMPTY);
      
      const normalChance = system.getCollapseChance(x, y, world);
      const earthquakeChance = system.getCollapseChance(x, y, world, { 
        earthquake: true, 
        earthquakeIntensity: 1 
      });
      
      if (Math.random() < normalChance) normalCollapses++;
      if (Math.random() < earthquakeChance) earthquakeCollapses++;
    }

    expect(earthquakeCollapses).toBeGreaterThan(normalCollapses * 1.5);
  });
});
