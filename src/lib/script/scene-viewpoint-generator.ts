// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Scene Viewpoint Generator
 * 
 * 从Scene校准数据和Shot动作描写中提取Viewpoint需求，
 * 生成多Viewpoint联合图Prompt，用于生成 6 格联合图。
 */

import type { ScriptScene, Shot } from '@/types/script';

// ==================== 类型定义 ====================

/**
 * SceneViewpoint定义
 */
export interface SceneViewpoint {
  id: string;           // ViewpointID，如 'dining', 'sofa', 'window'
  name: string;         // 中文名：餐桌区、沙Hair区、窗边
  nameEn: string;       // 英文名：Dining Area, Sofa Area, Window
  shotIds: string[];    // 关联的ShotID列表
  keyProps: string[];   // 该Viewpoint需要的道具（中文）
  keyPropsEn: string[]; // 该Viewpoint需要的道具（英文）
  description: string;  // Viewpoint描述（中文）
  descriptionEn: string; // Viewpoint描述（英文）
  gridIndex: number;    // 在联合图中的位置 (0-5)
}

/**
 * 联合图生成配置
 */
export interface ContactSheetConfig {
  scene: ScriptScene;
  shots: Shot[];
  styleTokens: string[];
  aspectRatio: '16:9' | '9:16';
  maxViewpoints?: number; // 默认 6
}

/**
 * 联合图生成结果
 */
export interface ContactSheetPromptResult {
  prompt: string;           // 英文Prompt
  promptZh: string;         // 中文Prompt
  viewpoints: SceneViewpoint[];
  gridLayout: {
    rows: number;
    cols: number;
  };
}

// ==================== 环境类型定义 ====================

/**
 * Scene环境类型
 */
export type SceneEnvironmentType = 
  | 'vehicle'        // 现代交通工具（大巴、汽车、火车、飞机等）
  | 'outdoor'        // 现代户外（公路、街道、公园等）
  | 'indoor_home'    // 现代Indoor家居
  | 'indoor_work'    // 现代Indoor办公/商业
  | 'indoor_public'  // 现代Indoor公Total（医院、学校、餐厅等）
  | 'ancient_indoor' // 古代Indoor（宫殿、府邸、客栈、寺庙等）
  | 'ancient_outdoor'// 古代户外（官道、Episode市、城门等）
  | 'ancient_vehicle'// 古代交通（马车、轿子、船等）
  | 'unknown';       // 未知

/**
 * 环境类型Keywords检测
 * 用于从SceneLocation推断环境类型
 */
const ENVIRONMENT_KEYWORDS: Record<SceneEnvironmentType, string[]> = {
  // === 古代Scene（优先检测） ===
  ancient_indoor: [
    // 宫廷/皇家
    '宫殿', '宫', '殿', '皇宫', '宫门', '内廷', '御书房', '御花园', '太和殿', '乾清宫',
    '坐厉宫', '冷宫', '东宫', '西宫', '后宫',
    // 府邸/民居
    '府邸', '府', '宅', '宅院', '大宅', '老宅', '内宅', '外宅',
    '堂屋', '正堂', '大堂', '厅堂', '厅',
    '闺房', '内室', '绣楼', '书馆', '花厅',
    // 公Total建筑
    '客栈', '酒楼', '酒肃', '茶楼', '茶馆', '饭庄', '庙', '寺', '寺庙', '禅房',
    '道观', '尼姑庵', '龙门客栈', '悦来客栈',
    '祁堂', '调堆', '灵堂', '宗祠',
    '衙门', '公堂', '大理寺',
    // 古代具体房间
    '书房', '琴房', '内堂', '账房', '茶房', '库房',
  ],
  ancient_outdoor: [
    // 城市
    '城门', '城墙', '城楼', '城外', '城内', '皇城',
    'Episode市', 'Episode', '市Episode', '庙会', '夜市', '东市', '西市',
    '街', '长街', '巷', '巷子', '巷口',
    '牌坊', '广场', '点将台', '校场',
    // 道路/旅途
    '官道', '驿站', '驿道', '山路', '山道', '古道', '商道', '街道',
    '模到', '南道', '北道',
    // 自然/庭院
    '庭院', '庭', '院', '前院', '后院', '内院', '外院',
    '花园', '后花园', '御花园', '池塘', '荷塘', '亝子',
    '山野', '林间', '溓畔', '桥头', '渡口', '码头',
  ],
  ancient_vehicle: [
    '马车', '车', '轿子', '轿', '牛车', '马', '骑马',
    '船', '客船', '商船', '渔船', '画舷', '小船', '帆船', '舜',
    '车内', '轿内', '舱内', '船舱',
  ],
  
  // === 现代Scene ===
  vehicle: [
    '大巴', '巴士', '公交', '汽车', '轿车', '出租车', '的士', 'uber',
    '火车', '高铁', '动车', '地铁', '列车',
    '飞机', '航班', '机舱',
    '游艇', '渡轮', '轮船', '游轮',
    '车内', '车上', '车厢',
  ],
  outdoor: [
    '公路', '马路', '街道', '街头', '路边', '十字路口',
    '公园', '广场', '操场', '球场',
    '乡村', '田野', '山', '河', '海边', '沙滩', '森林', '树林',
    '院子', '庭院', '花园', '天台', '楼顶', '屋顶',
    '停车场', '加油站',
  ],
  indoor_home: [
    '家', '住宅', '公寓', '别墅', '宿舍',
    '客厅', '卧室', '厨房', '餐厅', '书房', '卫生间', '浴室', '阳台',
    '房间', '屋内', '屋里',
  ],
  indoor_work: [
    '办公室', '公司', '写字楼', '会议室', '工厂', '车间', '仓库',
    '店', '商店', '超市', '商场',
  ],
  indoor_public: [
    '医院', '诊所', '病房', '手术室',
    '学校', '教室', '图书馆', '食堂',
    '餐厅', '酒店', '宾馆', '旅馆', '咖啡厅', '酒吧', 'KTV',
    '派出所', '警局', '法院', '监狱',
    '银行', '邮局', '机场', '车站', '码头',
  ],
  unknown: [],
};

/**
 * 清理SceneLocation字符串，移除人物信息等None关内容
 */
function cleanLocationString(location: string): string {
  // 移除 "人物：XXX" 部分
  let cleaned = location.replace(/\s*人物[：:].*/g, '');
  // 移除 "角色：XXX" 部分
  cleaned = cleaned.replace(/\s*角色[：:].*/g, '');
  // 移除 "时间：XXX" 部分
  cleaned = cleaned.replace(/\s*时间[：:].*/g, '');
  // 去除首尾空白
  return cleaned.trim();
}

/**
 * 从SceneLocation推断环境类型
 */
export function detectEnvironmentType(location: string): SceneEnvironmentType {
  // 先清理Location字符串
  const cleanedLocation = cleanLocationString(location);
  const normalizedLocation = cleanedLocation.toLowerCase();
  
  console.log(`[detectEnvironmentType] 原始: "${location}" -> 清理后: "${cleanedLocation}"`);
  
  // 按优先级检测：古代 > 现代交通 > 户外 > Indoor公Total > Indoor办公 > Indoor家居
  const priorities: SceneEnvironmentType[] = [
    'ancient_vehicle', 'ancient_indoor', 'ancient_outdoor',  // 古代优先
    'vehicle', 'outdoor', 'indoor_public', 'indoor_work', 'indoor_home'
  ];
  
  for (const envType of priorities) {
    const keywords = ENVIRONMENT_KEYWORDS[envType];
    for (const keyword of keywords) {
      if (normalizedLocation.includes(keyword)) {
        console.log(`[detectEnvironmentType] 匹配到Keywords "${keyword}" -> 环境类型: ${envType}`);
        return envType;
      }
    }
  }
  
  console.log(`[detectEnvironmentType] 未匹配到任何Keywords -> unknown`);
  return 'unknown';
}

// ==================== ViewpointKeywords映射 ====================

/**
 * Viewpoint配置（带环境兼容性）
 */
interface ViewpointConfig {
  id: string;
  name: string;
  nameEn: string;
  propsZh: string[];
  propsEn: string[];
  /** 兼容的环境类型，空数组表示通用 */
  environments: SceneEnvironmentType[];
}

/**
 * 动作Keywords -> Viewpoint映射
 * 从Shot动作描写中识别需要的Viewpoint
 * 扩展Keywords以覆盖更多Scene
 * 
 * 【重要】environments 字段控制该Viewpoint适用于哪些环境类型
 * - 空数组 [] 表示通用Viewpoint，适用于所有环境
 * - 指定环境类型列表表示仅在这些环境中匹配
 */
const VIEWPOINT_KEYWORDS: Record<string, ViewpointConfig> = {
  // ========== 古代IndoorViewpoint (ancient_indoor) ==========
  // 堂屋/正厅
  '堂屋': { id: 'ancient_hall', name: '堂屋', nameEn: 'Main Hall', propsZh: ['太师椅', '案几', '寿屏'], propsEn: ['taishi chair', 'table', 'screen'], environments: ['ancient_indoor'] },
  '正堂': { id: 'ancient_hall', name: '正堂', nameEn: 'Main Hall', propsZh: ['寿屏', '上座'], propsEn: ['screen', 'main seat'], environments: ['ancient_indoor'] },
  '大堂': { id: 'ancient_hall', name: '大堂', nameEn: 'Grand Hall', propsZh: ['案几', '纱帐'], propsEn: ['table', 'gauze curtain'], environments: ['ancient_indoor'] },
  '厅堂': { id: 'ancient_hall', name: '厅堂', nameEn: 'Reception Hall', propsZh: ['案几', '寛椅'], propsEn: ['table', 'armchair'], environments: ['ancient_indoor'] },
  // 案几/坐具
  '案几': { id: 'ancient_table', name: '案几', nameEn: 'Ancient Table', propsZh: ['案几', '茶具', '笔墨'], propsEn: ['table', 'tea set', 'brush and ink'], environments: ['ancient_indoor'] },
  '书案': { id: 'ancient_table', name: '书案', nameEn: 'Writing Desk', propsZh: ['书案', '笔墨纸砚'], propsEn: ['writing desk', 'brush, ink, paper, inkstone'], environments: ['ancient_indoor'] },
  '坐在案前': { id: 'ancient_table', name: '案几', nameEn: 'At the Table', propsZh: ['案几'], propsEn: ['table'], environments: ['ancient_indoor'] },
  '跑堂': { id: 'ancient_table', name: '酒楼大堂', nameEn: 'Tavern Hall', propsZh: ['方桌', '酒壶', '菜肴'], propsEn: ['square table', 'wine pot', 'dishes'], environments: ['ancient_indoor'] },
  // 屏风/蜗帐
  '屏风': { id: 'ancient_screen', name: '屏风', nameEn: 'Screen View', propsZh: ['屏风', '帐幔'], propsEn: ['screen', 'curtain'], environments: ['ancient_indoor'] },
  '纱帐': { id: 'ancient_screen', name: '纱帐', nameEn: 'Gauze Curtain', propsZh: ['纱帐', '垂帐'], propsEn: ['gauze curtain', 'hanging drape'], environments: ['ancient_indoor'] },
  '帐后': { id: 'ancient_screen', name: '帐后', nameEn: 'Behind the Curtain', propsZh: ['帐幔'], propsEn: ['curtain'], environments: ['ancient_indoor'] },
  // 闺房/内室
  '闺房': { id: 'ancient_boudoir', name: '闺房', nameEn: 'Boudoir', propsZh: ['妆台', '铜镜', '梳妆盒'], propsEn: ['dressing table', 'bronze mirror', 'makeup box'], environments: ['ancient_indoor'] },
  '梳妆': { id: 'ancient_boudoir', name: '妆台', nameEn: 'Dressing Table', propsZh: ['妆台', '铜镜'], propsEn: ['dressing table', 'bronze mirror'], environments: ['ancient_indoor'] },
  '绣楼': { id: 'ancient_boudoir', name: '绣楼', nameEn: 'Embroidery Chamber', propsZh: ['绣架', '绣线'], propsEn: ['embroidery frame', 'silk thread'], environments: ['ancient_indoor'] },
  // 榻/床
  '榻': { id: 'ancient_couch', name: '榻', nameEn: 'Ancient Couch', propsZh: ['榻', '软垫'], propsEn: ['daybed', 'cushion'], environments: ['ancient_indoor'] },
  '罗汉床': { id: 'ancient_couch', name: '罗汉床', nameEn: 'Arhat Bed', propsZh: ['罗汉床', '青瓷茶具'], propsEn: ['arhat bed', 'celadon tea set'], environments: ['ancient_indoor'] },
  '床榻': { id: 'ancient_couch', name: '床榻', nameEn: 'Bed', propsZh: ['床', '床帐'], propsEn: ['bed', 'bed curtain'], environments: ['ancient_indoor'] },
  '厂房': { id: 'ancient_couch', name: '卢室', nameEn: 'Bedroom', propsZh: ['床', '帐子'], propsEn: ['bed', 'canopy'], environments: ['ancient_indoor'] },
  // 书房古代
  '挥毫': { id: 'ancient_study', name: '书房', nameEn: 'Study', propsZh: ['笔墨纸砚', '书架'], propsEn: ['four treasures of study', 'bookshelf'], environments: ['ancient_indoor'] },
  '提笔': { id: 'ancient_study', name: '书房', nameEn: 'Study', propsZh: ['毛笔', '砕台'], propsEn: ['brush', 'inkstone'], environments: ['ancient_indoor'] },
  '读书': { id: 'ancient_study', name: '书房', nameEn: 'Study', propsZh: ['书卷', '烛灯'], propsEn: ['books', 'candle'], environments: ['ancient_indoor'] },
  // 佛堂/祁堂
  '佛堂': { id: 'ancient_shrine', name: '佛堂', nameEn: 'Buddha Hall', propsZh: ['佛像', '香炉', '蒲团'], propsEn: ['Buddha statue', 'incense burner', 'cushion'], environments: ['ancient_indoor'] },
  '上香': { id: 'ancient_shrine', name: '佛堂', nameEn: 'Offering Incense', propsZh: ['香炉', '香'], propsEn: ['incense burner', 'incense'], environments: ['ancient_indoor'] },
  '跨拜': { id: 'ancient_shrine', name: '祁堂', nameEn: 'Ancestral Hall', propsZh: ['牠位', '跨垫'], propsEn: ['memorial tablet', 'kneeling cushion'], environments: ['ancient_indoor'] },
  
  // ========== 古代户外Viewpoint (ancient_outdoor) ==========
  // 庭院
  '庭院': { id: 'ancient_courtyard', name: '庭院', nameEn: 'Courtyard', propsZh: ['假山', '水池', '花丛'], propsEn: ['rockery', 'pond', 'flower bed'], environments: ['ancient_outdoor'] },
  '前院': { id: 'ancient_courtyard', name: '前院', nameEn: 'Front Yard', propsZh: ['石阶', '垂花'], propsEn: ['stone steps', 'hanging flowers'], environments: ['ancient_outdoor'] },
  '后院': { id: 'ancient_courtyard', name: '后院', nameEn: 'Back Yard', propsZh: ['花丛', '竹林'], propsEn: ['flower bed', 'bamboo grove'], environments: ['ancient_outdoor'] },
  // 池塘/亝子
  '池塘': { id: 'ancient_pond', name: '池塘', nameEn: 'Pond View', propsZh: ['荷塘', '木桥', '亝'], propsEn: ['lotus pond', 'wooden bridge', 'pavilion'], environments: ['ancient_outdoor'] },
  '荷塘': { id: 'ancient_pond', name: '荷塘', nameEn: 'Lotus Pond', propsZh: ['荷叶', '荷花', '莲蓬'], propsEn: ['lotus leaves', 'lotus flowers', 'lotus seedpod'], environments: ['ancient_outdoor'] },
  '亝子': { id: 'ancient_pavilion', name: '亝子', nameEn: 'Pavilion', propsZh: ['亝', '石凳', '栏杆'], propsEn: ['pavilion', 'stone bench', 'railing'], environments: ['ancient_outdoor'] },
  '流水': { id: 'ancient_pond', name: '水景', nameEn: 'Water View', propsZh: ['小桥', '流水'], propsEn: ['bridge', 'stream'], environments: ['ancient_outdoor'] },
  // 官道/街道
  '官道': { id: 'ancient_road', name: '官道', nameEn: 'Official Road', propsZh: ['官道', '松柏'], propsEn: ['road', 'pine trees'], environments: ['ancient_outdoor'] },
  '驿站': { id: 'ancient_road', name: '驿站', nameEn: 'Post Station', propsZh: ['驿站', '马棚'], propsEn: ['post station', 'stable'], environments: ['ancient_outdoor'] },
  '赶路': { id: 'ancient_road', name: '道路', nameEn: 'Road', propsZh: ['道路'], propsEn: ['road'], environments: ['ancient_outdoor'] },
  // Episode市/城门
  'Episode市': { id: 'ancient_market', name: 'Episode市', nameEn: 'Market', propsZh: ['市Episode', '摆', '人群'], propsEn: ['market', 'stalls', 'crowd'], environments: ['ancient_outdoor'] },
  '城门': { id: 'ancient_gate', name: '城门', nameEn: 'City Gate', propsZh: ['城门', '城墙', '士兵'], propsEn: ['city gate', 'city wall', 'soldiers'], environments: ['ancient_outdoor'] },
  '城楼': { id: 'ancient_gate', name: '城楼', nameEn: 'City Tower', propsZh: ['城楼', '城墙'], propsEn: ['city tower', 'city wall'], environments: ['ancient_outdoor'] },
  // 码头/渡口
  '码头': { id: 'ancient_dock', name: '码头', nameEn: 'Dock', propsZh: ['木栅', '船只', '缆绳'], propsEn: ['wooden pier', 'boats', 'mooring rope'], environments: ['ancient_outdoor'] },
  '渡口': { id: 'ancient_dock', name: '渡口', nameEn: 'Ferry Crossing', propsZh: ['渡船', '河水'], propsEn: ['ferry boat', 'river'], environments: ['ancient_outdoor'] },
  
  // ========== 古代交通Viewpoint (ancient_vehicle) ==========
  // 马车/轿子
  '轿子': { id: 'ancient_sedan', name: '轿内', nameEn: 'Sedan Chair', propsZh: ['轿帘', '轿内'], propsEn: ['sedan curtain', 'sedan interior'], environments: ['ancient_vehicle'] },
  '轿内': { id: 'ancient_sedan', name: '轿内', nameEn: 'Inside Sedan', propsZh: ['轿帘', '坐垫'], propsEn: ['sedan curtain', 'cushion'], environments: ['ancient_vehicle'] },
  '上轿': { id: 'ancient_sedan', name: '轿门', nameEn: 'Entering Sedan', propsZh: ['轿门', '轿帘'], propsEn: ['sedan door', 'curtain'], environments: ['ancient_vehicle'] },
  '下轿': { id: 'ancient_sedan', name: '轿门', nameEn: 'Exiting Sedan', propsZh: ['轿门'], propsEn: ['sedan door'], environments: ['ancient_vehicle'] },
  '马车': { id: 'ancient_carriage', name: '车内', nameEn: 'Carriage', propsZh: ['车篾', '坐垫'], propsEn: ['carriage canopy', 'cushion'], environments: ['ancient_vehicle'] },
  '车内': { id: 'ancient_carriage', name: '车内', nameEn: 'Inside Carriage', propsZh: ['车篾', '窗帘'], propsEn: ['canopy', 'window curtain'], environments: ['ancient_vehicle'] },
  // 船只
  '船舱': { id: 'ancient_boat', name: '船舱', nameEn: 'Boat Cabin', propsZh: ['船舱', '窗子'], propsEn: ['cabin', 'window'], environments: ['ancient_vehicle'] },
  '舱内': { id: 'ancient_boat', name: '船舱', nameEn: 'Inside Cabin', propsZh: ['船舱', '窗子', '木方'], propsEn: ['cabin', 'window', 'wooden table'], environments: ['ancient_vehicle'] },
  '甲板': { id: 'ancient_deck', name: '甲板', nameEn: 'Ship Deck', propsZh: ['甲板', '桶杆', '风帆'], propsEn: ['deck', 'mast', 'sail'], environments: ['ancient_vehicle'] },
  '船头': { id: 'ancient_deck', name: '船头', nameEn: 'Bow', propsZh: ['船头', '桶杆'], propsEn: ['bow', 'mast'], environments: ['ancient_vehicle'] },
  '船尾': { id: 'ancient_deck', name: '船尾', nameEn: 'Stern', propsZh: ['船尾', '艰'], propsEn: ['stern', 'rudder'], environments: ['ancient_vehicle'] },
  // 骑马
  '骑马': { id: 'ancient_horse', name: '马背', nameEn: 'On Horseback', propsZh: ['马', '缰绳', '马鞍'], propsEn: ['horse', 'reins', 'saddle'], environments: ['ancient_vehicle'] },
  '上马': { id: 'ancient_horse', name: '马背', nameEn: 'Mounting', propsZh: ['马蹬', '马鞍'], propsEn: ['stirrup', 'saddle'], environments: ['ancient_vehicle'] },
  '下马': { id: 'ancient_horse', name: '马背', nameEn: 'Dismounting', propsZh: ['马'], propsEn: ['horse'], environments: ['ancient_vehicle'] },
  '驰骋': { id: 'ancient_horse', name: '马背', nameEn: 'Galloping', propsZh: ['马', '缰绳'], propsEn: ['horse', 'reins'], environments: ['ancient_vehicle'] },
  
  // ========== 现代交通工具Viewpoint (vehicle) ==========
  // 车窗Viewpoint
  '车窗': { id: 'vehicle_window', name: '车窗', nameEn: 'Vehicle Window View', propsZh: ['车窗', '窗外风景'], propsEn: ['vehicle window', 'outside scenery'], environments: ['vehicle'] },
  '窗外风景': { id: 'vehicle_window', name: '车窗', nameEn: 'Vehicle Window View', propsZh: ['车窗', '风景'], propsEn: ['vehicle window', 'scenery'], environments: ['vehicle'] },
  // 车内座位Viewpoint
  '座位': { id: 'vehicle_seat', name: '座位区', nameEn: 'Seat Area', propsZh: ['座位', '扁手'], propsEn: ['seat', 'armrest'], environments: ['vehicle'] },
  '车座': { id: 'vehicle_seat', name: '座位区', nameEn: 'Seat Area', propsZh: ['车座'], propsEn: ['vehicle seat'], environments: ['vehicle'] },
  '坐在': { id: 'vehicle_seat', name: '座位区', nameEn: 'Seat Area', propsZh: ['座位'], propsEn: ['seat'], environments: ['vehicle'] },
  // 车内过道Viewpoint
  '过道': { id: 'vehicle_aisle', name: '过道', nameEn: 'Aisle View', propsZh: ['过道', '扶手'], propsEn: ['aisle', 'handrail'], environments: ['vehicle'] },
  '走道': { id: 'vehicle_aisle', name: '过道', nameEn: 'Aisle View', propsZh: ['过道'], propsEn: ['aisle'], environments: ['vehicle'] },
  // 驾驶位Viewpoint
  '驾驶': { id: 'vehicle_driver', name: '驾驶位', nameEn: 'Driver Area', propsZh: ['方向盘', '仪表盘'], propsEn: ['steering wheel', 'dashboard'], environments: ['vehicle'] },
  '司机': { id: 'vehicle_driver', name: '驾驶位', nameEn: 'Driver Area', propsZh: ['方向盘'], propsEn: ['steering wheel'], environments: ['vehicle'] },
  '开车': { id: 'vehicle_driver', name: '驾驶位', nameEn: 'Driver Area', propsZh: ['方向盘', '仪表盘'], propsEn: ['steering wheel', 'dashboard'], environments: ['vehicle'] },
  // 车门Viewpoint
  '车门': { id: 'vehicle_door', name: '车门', nameEn: 'Vehicle Door', propsZh: ['车门', '台阶'], propsEn: ['vehicle door', 'steps'], environments: ['vehicle'] },
  '上车': { id: 'vehicle_door', name: '车门', nameEn: 'Vehicle Door', propsZh: ['车门', '台阶'], propsEn: ['vehicle door', 'steps'], environments: ['vehicle'] },
  '下车': { id: 'vehicle_door', name: '车门', nameEn: 'Vehicle Door', propsZh: ['车门', '台阶'], propsEn: ['vehicle door', 'steps'], environments: ['vehicle'] },
  
  // ========== 户外Viewpoint (outdoor) ==========
  // 道路Viewpoint
  '路边': { id: 'roadside', name: '路边', nameEn: 'Roadside View', propsZh: ['道路', '路牙'], propsEn: ['road', 'curb'], environments: ['outdoor'] },
  '马路': { id: 'roadside', name: '道路', nameEn: 'Road View', propsZh: ['道路', '树木'], propsEn: ['road', 'trees'], environments: ['outdoor'] },
  '街道': { id: 'street', name: '街景', nameEn: 'Street View', propsZh: ['街道', '路灯', '店铺'], propsEn: ['street', 'streetlight', 'shops'], environments: ['outdoor'] },
  '街头': { id: 'street', name: '街景', nameEn: 'Street View', propsZh: ['街道', '行人'], propsEn: ['street', 'pedestrians'], environments: ['outdoor'] },
  // 自然风景Viewpoint
  '田野': { id: 'nature', name: '自然风景', nameEn: 'Nature View', propsZh: ['田野', '庄稼'], propsEn: ['field', 'crops'], environments: ['outdoor'] },
  '山': { id: 'nature', name: '自然风景', nameEn: 'Nature View', propsZh: ['山峦'], propsEn: ['mountains'], environments: ['outdoor'] },
  '河': { id: 'nature', name: '自然风景', nameEn: 'Nature View', propsZh: ['河流'], propsEn: ['river'], environments: ['outdoor'] },
  '树': { id: 'nature', name: '自然风景', nameEn: 'Nature View', propsZh: ['树木', '树叶'], propsEn: ['trees', 'leaves'], environments: ['outdoor'] },
  // 庭院Viewpoint
  '院子': { id: 'yard', name: '庭院', nameEn: 'Yard View', propsZh: ['院子', '围墙'], propsEn: ['yard', 'wall'], environments: ['outdoor'] },
  '花园': { id: 'garden', name: '花园', nameEn: 'Garden View', propsZh: ['花卉', '植物'], propsEn: ['flowers', 'plants'], environments: ['outdoor'] },
  
  // ========== Indoor家居Viewpoint (indoor_home) ==========
  // 餐桌/用餐相关
  '吃饭': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷', '菜肴'], propsEn: ['dining table', 'bowls and chopsticks', 'dishes'], environments: ['indoor_home', 'indoor_public'] },
  '饭桌': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷', '菜肴'], propsEn: ['dining table', 'bowls and chopsticks', 'dishes'], environments: ['indoor_home', 'indoor_public'] },
  '餐桌': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷'], propsEn: ['dining table', 'bowls and chopsticks'], environments: ['indoor_home', 'indoor_public'] },
  '用餐': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷', '菜肴'], propsEn: ['dining table', 'bowls and chopsticks', 'dishes'], environments: ['indoor_home', 'indoor_public'] },
  '端菜': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '菜肴'], propsEn: ['dining table', 'dishes'], environments: ['indoor_home', 'indoor_public'] },
  '夹菜': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷'], propsEn: ['dining table', 'chopsticks'], environments: ['indoor_home', 'indoor_public'] },
  '喝酒': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '酒杯'], propsEn: ['dining table', 'wine glass'], environments: ['indoor_home', 'indoor_public'] },
  '碰杯': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '酒杯'], propsEn: ['dining table', 'glasses'], environments: ['indoor_home', 'indoor_public'] },
  '举杯': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '酒杯'], propsEn: ['dining table', 'glasses'], environments: ['indoor_home', 'indoor_public'] },
  
  // 沙Hair/客厅相关 - 仅Indoor家居
  '沙Hair': { id: 'sofa', name: '沙Hair区', nameEn: 'Sofa Area', propsZh: ['沙Hair', '茶几', '电视'], propsEn: ['sofa', 'coffee table', 'TV'], environments: ['indoor_home'] },
  '看电视': { id: 'sofa', name: '沙Hair区', nameEn: 'Sofa Area', propsZh: ['沙Hair', '电视'], propsEn: ['sofa', 'television'], environments: ['indoor_home'] },
  '茶几': { id: 'sofa', name: '沙Hair区', nameEn: 'Sofa Area', propsZh: ['沙Hair', '茶几'], propsEn: ['sofa', 'coffee table'], environments: ['indoor_home'] },
  '倒茶': { id: 'sofa', name: '沙Hair区', nameEn: 'Sofa Area', propsZh: ['沙Hair', '茶几', '茶壶'], propsEn: ['sofa', 'coffee table', 'teapot'], environments: ['indoor_home', 'indoor_work'] },
  '喝茶': { id: 'sofa', name: '沙Hair区', nameEn: 'Sofa Area', propsZh: ['沙Hair', '茶几', '茶杯'], propsEn: ['sofa', 'coffee table', 'teacup'], environments: ['indoor_home', 'indoor_work'] },
  
  // 窗边相关 - Indoor用
  '窗': { id: 'window', name: '窗边', nameEn: 'Window View', propsZh: ['窗户', '窗帘'], propsEn: ['window', 'curtains'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '窗外': { id: 'window', name: '窗边', nameEn: 'Window View', propsZh: ['窗户', '窗帘', '自然光'], propsEn: ['window', 'curtains', 'natural light'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '窗边': { id: 'window', name: '窗边', nameEn: 'Window View', propsZh: ['窗户', '窗帘'], propsEn: ['window', 'curtains'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '阳台': { id: 'window', name: '窗边/阳台', nameEn: 'Balcony View', propsZh: ['阳台', '栏杆'], propsEn: ['balcony', 'railing'], environments: ['indoor_home'] },
  '窗帘': { id: 'window', name: '窗边', nameEn: 'Window View', propsZh: ['窗户', '窗帘'], propsEn: ['window', 'curtains'], environments: ['indoor_home', 'indoor_work'] },
  
  // 入口/门相关 - Indoor用
  '门口': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['门', '玄关'], propsEn: ['door', 'entrance'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '门': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['门', '玄关'], propsEn: ['door', 'entrance'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '进门': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['门', '玄关'], propsEn: ['door', 'entrance'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '出门': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['门'], propsEn: ['door'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '回家': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['门', '玄关'], propsEn: ['door', 'entrance'], environments: ['indoor_home'] },
  '进来': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['门'], propsEn: ['door'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '走进': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['门'], propsEn: ['door'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '离开': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['门'], propsEn: ['door'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '玄关': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['门', '玄关', '鞋柜'], propsEn: ['door', 'entrance', 'shoe cabinet'], environments: ['indoor_home'] },
  '换鞋': { id: 'entrance', name: '入口', nameEn: 'Entrance View', propsZh: ['玄关', '鞋柜'], propsEn: ['entrance', 'shoe cabinet'], environments: ['indoor_home'] },
  
  // 厨房相关 - 仅Indoor家居
  '厨房': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['灶台', '橱柜'], propsEn: ['stove', 'cabinets'], environments: ['indoor_home'] },
  '做饭': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['灶台', '锅具'], propsEn: ['stove', 'cookware'], environments: ['indoor_home'] },
  '烧菜': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['灶台', '锅具'], propsEn: ['stove', 'cookware'], environments: ['indoor_home'] },
  '炒菜': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['灶台', '锅具'], propsEn: ['stove', 'wok'], environments: ['indoor_home'] },
  '洗碗': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['水槽', '碗碟'], propsEn: ['sink', 'dishes'], environments: ['indoor_home'] },
  '切菜': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['砧板', '菜刀'], propsEn: ['cutting board', 'knife'], environments: ['indoor_home'] },
  '冰箱': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['冰箱'], propsEn: ['refrigerator'], environments: ['indoor_home'] },
  
  // 书房/工作相关 - Indoor家居+办公
  '书桌': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '台灯', '书架'], propsEn: ['desk', 'lamp', 'bookshelf'], environments: ['indoor_home', 'indoor_work'] },
  '电脑': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '电脑'], propsEn: ['desk', 'computer'], environments: ['indoor_home', 'indoor_work'] },
  '看书': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '台灯'], propsEn: ['desk', 'lamp'], environments: ['indoor_home', 'indoor_public'] },
  '写字': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '台灯'], propsEn: ['desk', 'lamp'], environments: ['indoor_home', 'indoor_work'] },
  '办公': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '电脑'], propsEn: ['desk', 'computer'], environments: ['indoor_work'] },
  '文件': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '文件'], propsEn: ['desk', 'documents'], environments: ['indoor_home', 'indoor_work'] },
  '书架': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书架', '书籍'], propsEn: ['bookshelf', 'books'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  
  // 卧室相关 - 必须明确提到床或卧室
  '卧室': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床', '床头柜'], propsEn: ['bed', 'nightstand'], environments: ['indoor_home'] },
  '床上': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床'], propsEn: ['bed'], environments: ['indoor_home'] },
  '起床': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床', '床头柜'], propsEn: ['bed', 'nightstand'], environments: ['indoor_home'] },
  '床头': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床', '床头柜', '台灯'], propsEn: ['bed', 'nightstand', 'lamp'], environments: ['indoor_home'] },
  '被窝': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床', '被子'], propsEn: ['bed', 'blanket'], environments: ['indoor_home'] },
  
  // ========== 通用Viewpoint（适用于所有环境） ==========
  // 对话/情感Scene - 通用
  '交谈': { id: 'conversation', name: '对话区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '聊天': { id: 'conversation', name: '对话区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '说话': { id: 'conversation', name: '对话区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '争吵': { id: 'conversation', name: '对话区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '吵架': { id: 'conversation', name: '对话区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '哭泣': { id: 'emotion', name: '情感Close-up', nameEn: 'Emotional Close-up', propsZh: [], propsEn: [], environments: [] },
  '流泪': { id: 'emotion', name: '情感Close-up', nameEn: 'Emotional Close-up', propsZh: [], propsEn: [], environments: [] },
  '微笑': { id: 'emotion', name: '情感Close-up', nameEn: 'Emotional Close-up', propsZh: [], propsEn: [], environments: [] },
  '拥抱': { id: 'emotion', name: '情感Close-up', nameEn: 'Emotional Close-up', propsZh: [], propsEn: [], environments: [] },
  
  // Close-upShot - 通用
  '手': { id: 'detail', name: '细节Close-up', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  '握着': { id: 'detail', name: '细节Close-up', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  '拿起': { id: 'detail', name: '细节Close-up', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  '放下': { id: 'detail', name: '细节Close-up', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  'Close-up': { id: 'detail', name: '细节Close-up', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  'Close Shot': { id: 'detail', name: '细节Close-up', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  
  // 观看/类泛用动作 - 通用
  '望向': { id: 'looking', name: '观看Viewpoint', nameEn: 'Looking View', propsZh: [], propsEn: [], environments: [] },
  '眰望': { id: 'looking', name: '观看Viewpoint', nameEn: 'Looking View', propsZh: [], propsEn: [], environments: [] },
  '注视': { id: 'looking', name: '观看Viewpoint', nameEn: 'Looking View', propsZh: [], propsEn: [], environments: [] },
  
  // 坐下/起身 - 根据环境动态适应
  '坐下': { id: 'seating', name: '坐席区', nameEn: 'Seating Area', propsZh: [], propsEn: [], environments: [] },
  '落座': { id: 'seating', name: '坐席区', nameEn: 'Seating Area', propsZh: [], propsEn: [], environments: [] },
  '起身': { id: 'seating', name: '坐席区', nameEn: 'Seating Area', propsZh: [], propsEn: [], environments: [] },
};

// ==================== 核心函数 ====================

/**
 * 从Shot动作描写中提取Viewpoint需求
 */
export function extractViewpointsFromShots(
  shots: Shot[],
  maxViewpoints: number = 6
): SceneViewpoint[] {
  const viewpointMap = new Map<string, SceneViewpoint>();
  
  for (const shot of shots) {
    const actionText = shot.actionSummary || '';
    
    // 检查每Keywords
    for (const [keyword, config] of Object.entries(VIEWPOINT_KEYWORDS)) {
      if (actionText.includes(keyword)) {
        if (!viewpointMap.has(config.id)) {
          viewpointMap.set(config.id, {
            id: config.id,
            name: config.name,
            nameEn: config.nameEn,
            shotIds: [shot.id],
            keyProps: [...config.propsZh],
            keyPropsEn: [...config.propsEn],
            description: '',
            descriptionEn: '',
            gridIndex: viewpointMap.size,
          });
        } else {
          const existing = viewpointMap.get(config.id)!;
          if (!existing.shotIds.includes(shot.id)) {
            existing.shotIds.push(shot.id);
          }
          // 合并道具
          for (const prop of config.propsZh) {
            if (!existing.keyProps.includes(prop)) {
              existing.keyProps.push(prop);
            }
          }
          for (const prop of config.propsEn) {
            if (!existing.keyPropsEn.includes(prop)) {
              existing.keyPropsEn.push(prop);
            }
          }
        }
      }
    }
  }
  
  // 按关联Shot数排序（常用Viewpoint优先）
  const viewpoints = Array.from(viewpointMap.values())
    .sort((a, b) => b.shotIds.length - a.shotIds.length)
    .slice(0, maxViewpoints);
  
  // 重新分配 gridIndex
  viewpoints.forEach((v, i) => { v.gridIndex = i; });
  
  // 如果Viewpoint不足 6 ，补充默认Viewpoint
  const defaultViewpoints: Array<Omit<SceneViewpoint, 'shotIds' | 'gridIndex'>> = [
    { id: 'overview', name: 'Wide Shot', nameEn: 'Overview', keyProps: [], keyPropsEn: [], description: '整体空间布局', descriptionEn: 'Overall spatial layout' },
    { id: 'detail', name: '细节', nameEn: 'Detail View', keyProps: [], keyPropsEn: [], description: '装饰细节Close-up', descriptionEn: 'Decorative details close-up' },
  ];
  
  while (viewpoints.length < maxViewpoints && defaultViewpoints.length > 0) {
    const def = defaultViewpoints.shift()!;
    if (!viewpoints.some(v => v.id === def.id)) {
      viewpoints.push({
        ...def,
        shotIds: [],
        gridIndex: viewpoints.length,
      });
    }
  }
  
  return viewpoints;
}

/**
 * 生成联合图Prompt
 * 优先使用 AI 分析的Viewpoint，如果没有则回退到Keywords提取
 */
export function generateContactSheetPrompt(config: ContactSheetConfig): ContactSheetPromptResult {
  const { scene, shots, styleTokens, aspectRatio, maxViewpoints = 6 } = config;
  
  // 优先使用 AI 分析的Viewpoint（来自 scene.viewpoints）
  let viewpoints: SceneViewpoint[];
  let isAIAnalyzed = false;
  
  if (scene.viewpoints && scene.viewpoints.length > 0) {
    // 使用 AI 分析的Viewpoint
    console.log(`[generateContactSheetPrompt] 使用 AI 分析Viewpoint: ${scene.viewpoints.length} `);
    viewpoints = scene.viewpoints.slice(0, maxViewpoints).map((v: any, idx: number) => ({
      id: v.id || `viewpoint_${idx}`,
      name: v.name || 'UntitledViewpoint',
      nameEn: v.nameEn || 'Unnamed Viewpoint',
      shotIds: v.shotIds || [],
      keyProps: v.keyProps || [],
      keyPropsEn: v.keyPropsEn || [],
      description: v.description || '',
      descriptionEn: v.descriptionEn || '',
      gridIndex: idx,
    }));
    isAIAnalyzed = true;
  } else {
    // 回退到Keywords提取
    console.log('[generateContactSheetPrompt] 没有 AI Viewpoint，回退到Keywords提取');
    viewpoints = extractViewpointsFromShots(shots, maxViewpoints);
  }
  
  // Confirm网格布局 - 强制使用 NxN 布局 (2x2 或 3x3)
  const vpCount = viewpoints.length;
  const gridLayout = vpCount <= 4 
    ? { rows: 2, cols: 2 }
    : { rows: 3, cols: 3 };
  
  // 构建Scene基础描述
  const sceneDescZh = [
    scene.architectureStyle && `建筑风格：${scene.architectureStyle}`,
    scene.colorPalette && `色彩基调：${scene.colorPalette}`,
    scene.eraDetails && `时代特征：${scene.eraDetails}`,
    scene.lightingDesign && `光影设计：${scene.lightingDesign}`,
  ].filter(Boolean).join('，');
  
  const sceneDescEn = [
    scene.architectureStyle && `Architecture: ${scene.architectureStyle}`,
    scene.colorPalette && `Color palette: ${scene.colorPalette}`,
    scene.eraDetails && `Era: ${scene.eraDetails}`,
    scene.lightingDesign && `Lighting: ${scene.lightingDesign}`,
  ].filter(Boolean).join('. ');
  
  // 为每Viewpoint生成描述
  viewpoints.forEach((vp, index) => {
    const propsZh = vp.keyProps.length > 0 ? `，包含${vp.keyProps.join('、')}` : '';
    const propsEn = vp.keyPropsEn.length > 0 ? ` with ${vp.keyPropsEn.join(', ')}` : '';
    
    vp.description = `${vp.name}Viewpoint${propsZh}`;
    vp.descriptionEn = `${vp.nameEn} angle${propsEn}`;
  });
  
  const styleStr = styleTokens.length > 0 
    ? styleTokens.join(', ') 
    : 'anime style, soft colors, detailed background';
  
  const totalCells = gridLayout.rows * gridLayout.cols;
  const paddedCount = totalCells;
  
  // 构建增强版Prompt — 对齐导演面板 generateGridAndSlice 的三层风格夹击结构
  const promptParts: string[] = [];
  
  // 1. 核心指令区 (Instruction Block) — 使用与导演面板一致的 storyboard grid 术语
  promptParts.push('<instruction>');
  promptParts.push(`Generate a clean ${gridLayout.rows}x${gridLayout.cols} storyboard grid with exactly ${paddedCount} equal-sized panels.`);
  promptParts.push(`Overall Image Aspect Ratio: ${aspectRatio}.`);
  // 明确指定单格子的宽高比，防止 AI 混淆（导演面板核心差异点）
  const panelAspect = aspectRatio === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
  promptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
  // 全局Visual Style（前置到指令区，权重最高 — 三层夹击第一层）
  if (styleStr) {
    promptParts.push(`MANDATORY Visual Style for ALL panels: ${styleStr}`);
  }
  promptParts.push('Structure: No borders between panels, no text, no watermarks, no speech bubbles.');
  promptParts.push('Consistency: Maintain consistent perspective, lighting, color grading, and visual style across ALL panels.');
  promptParts.push('Subject: Interior design and architectural details only, NO people.');
  promptParts.push('</instruction>');
  
  // 2. 布局描述
  promptParts.push(`Layout: ${gridLayout.rows} rows, ${gridLayout.cols} columns, reading order left-to-right, top-to-bottom.`);
  
  // 3. Scene信息
  if (sceneDescEn) {
    promptParts.push(`Scene Context: ${sceneDescEn}`);
  }
  
  // 4. 每格子的内容描述 — 每格附带 [same style] 锚定（三层夹击第二层）
  const styleAnchor = styleStr ? ' [same style]' : '';
  viewpoints.forEach((vp, idx) => {
    const row = Math.floor(idx / gridLayout.cols) + 1;
    const col = (idx % gridLayout.cols) + 1;
    
    promptParts.push(`Panel [row ${row}, col ${col}] (no people): ${vp.nameEn.toUpperCase()}: ${vp.descriptionEn}${styleAnchor}`);
  });
  
  // 5. 空白占位格描述
  for (let i = viewpoints.length; i < paddedCount; i++) {
    const row = Math.floor(i / gridLayout.cols) + 1;
    const col = (i % gridLayout.cols) + 1;
    promptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
  }
  
    // 6. 全局风格尾部再次强调（三层夹击第三层）
    if (styleStr) {
      promptParts.push(`IMPORTANT - Apply this EXACT style uniformly to every panel: ${styleStr}`);
    }
  
    // 7. 负面Prompt
    promptParts.push('Negative constraints: text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy, people, characters, distorted grid, uneven panels.');
    
    const prompt = promptParts.join('\n');

    // 中文Prompt
    const gridItemsZh = viewpoints.map((vp, i) => 
      `[${i + 1}] ${vp.name}：${vp.description || vp.name + 'Viewpoint'}`
    ).join('\n');
    
    const viewpointSource = isAIAnalyzed ? '（AI 分析）' : '（Keywords提取）';
  
  const promptZh = `一张${gridLayout.rows}x${gridLayout.cols}网格联合图，展示同一「${scene.name || scene.location}」Scene的${viewpoints.length}不同机位Viewpoint${viewpointSource}。
${sceneDescZh}

网格布局（从左到右，从上到下）：
${gridItemsZh}

风格：${styleTokens.length > 0 ? styleTokens.join('、') : '动画风格，柔和色彩，细节丰富'}，${viewpoints.length}格子保持一致的透视和光照。每格子用细白线分隔。只有背景，没有人物。`;

  return {
    prompt,
    promptZh,
    viewpoints,
    gridLayout,
  };
}

/**
 * 根据切割结果关联Viewpoint
 * 将切割后的Image分配给对应的Viewpoint
 */
export function assignViewpointImages(
  viewpoints: SceneViewpoint[],
  splitResults: Array<{
    id: number;
    dataUrl: string;
    row: number;
    col: number;
  }>,
  gridLayout: { rows: number; cols: number }
): Map<string, { imageUrl: string; gridIndex: number }> {
  const result = new Map<string, { imageUrl: string; gridIndex: number }>();
  
  for (const vp of viewpoints) {
    // 计算该Viewpoint在切割结果中的索引
    const gridIndex = vp.gridIndex;
    const row = Math.floor(gridIndex / gridLayout.cols);
    const col = gridIndex % gridLayout.cols;
    
    // 查找匹配的切割结果
    const splitResult = splitResults.find(sr => sr.row === row && sr.col === col);
    
    if (splitResult) {
      result.set(vp.id, {
        imageUrl: splitResult.dataUrl,
        gridIndex: gridIndex,
      });
    }
  }
  
  return result;
}

/**
 * 根据Shot动作自动匹配最佳Viewpoint
 */
export function matchShotToViewpoint(
  shot: Shot,
  viewpoints: SceneViewpoint[]
): string | null {
  const actionText = shot.actionSummary || '';
  
  // 检查Shot是否已关联到某Viewpoint
  for (const vp of viewpoints) {
    if (vp.shotIds.includes(shot.id)) {
      return vp.id;
    }
  }
  
  // 尝试根据动作Keywords匹配
  for (const [keyword, config] of Object.entries(VIEWPOINT_KEYWORDS)) {
    if (actionText.includes(keyword)) {
      const matchedVp = viewpoints.find(vp => vp.id === config.id);
      if (matchedVp) {
        return matchedVp.id;
      }
    }
  }
  
  // 默认BackWide ShotViewpoint
  const overviewVp = viewpoints.find(vp => vp.id === 'overview');
  return overviewVp?.id || viewpoints[0]?.id || null;
}

// ==================== 动态Viewpoint和分页支持 ====================

import type { 
  PendingViewpointData, 
  ContactSheetPromptSet 
} from '@/stores/media-panel-store';

/**
 * 从Shot文本中提取所有可Search的内容
 * 包括：Action Description、对白、视觉描述等
 */
function getShotSearchableText(shot: Shot): string {
  const parts = [
    shot.actionSummary || '',
    shot.dialogue || '',
    shot.visualDescription || '',
    shot.characterBlocking || '',
  ];
  return parts.join(' ');
}

/**
 * 根据环境类型获取默认Viewpoint列表
 * 用于在提取的Viewpoint不足时补充
 */
function getDefaultViewpointsForEnvironment(
  envType: SceneEnvironmentType
): Array<Omit<SceneViewpoint, 'shotIds' | 'gridIndex'>> {
  // 通用默认Viewpoint
  const commonDefaults: Array<Omit<SceneViewpoint, 'shotIds' | 'gridIndex'>> = [
    { id: 'overview', name: 'Wide Shot', nameEn: 'Overview', keyProps: [], keyPropsEn: [], description: '整体空间布局', descriptionEn: 'Overall spatial layout' },
    { id: 'detail', name: '细节', nameEn: 'Detail View', keyProps: [], keyPropsEn: [], description: '细节Close-up', descriptionEn: 'Detail close-up' },
  ];
  
  // 根据环境类型Back特定默认Viewpoint
  switch (envType) {
    case 'vehicle':
      return [
        { id: 'vehicle_window', name: '车窗', nameEn: 'Vehicle Window View', keyProps: ['车窗', '窗外风景'], keyPropsEn: ['vehicle window', 'outside scenery'], description: '车窗Viewpoint', descriptionEn: 'Vehicle window view' },
        { id: 'vehicle_seat', name: '座位区', nameEn: 'Seat Area', keyProps: ['座位'], keyPropsEn: ['seat'], description: '座位区域', descriptionEn: 'Seating area' },
        { id: 'vehicle_aisle', name: '过道', nameEn: 'Aisle View', keyProps: ['过道', '扶手'], keyPropsEn: ['aisle', 'handrail'], description: '过道Viewpoint', descriptionEn: 'Aisle view' },
        { id: 'vehicle_driver', name: '驾驶位', nameEn: 'Driver Area', keyProps: ['方向盘'], keyPropsEn: ['steering wheel'], description: '驾驶区域', descriptionEn: 'Driver area' },
        ...commonDefaults,
      ];
      
    case 'outdoor':
      return [
        { id: 'nature', name: '自然风景', nameEn: 'Nature View', keyProps: [], keyPropsEn: [], description: '自然风景Viewpoint', descriptionEn: 'Nature scenery view' },
        { id: 'roadside', name: '路边', nameEn: 'Roadside View', keyProps: ['道路'], keyPropsEn: ['road'], description: '路边Viewpoint', descriptionEn: 'Roadside view' },
        { id: 'street', name: '街景', nameEn: 'Street View', keyProps: ['街道'], keyPropsEn: ['street'], description: '街景Viewpoint', descriptionEn: 'Street view' },
        ...commonDefaults,
      ];
      
    case 'indoor_home':
      return [
        { id: 'sofa', name: '沙Hair区', nameEn: 'Sofa Area', keyProps: ['沙Hair', '茶几'], keyPropsEn: ['sofa', 'coffee table'], description: '沙Hair区域', descriptionEn: 'Sofa area' },
        { id: 'window', name: '窗边', nameEn: 'Window View', keyProps: ['窗户', '窗帘'], keyPropsEn: ['window', 'curtains'], description: '窗边Viewpoint', descriptionEn: 'Window view' },
        { id: 'entrance', name: '入口', nameEn: 'Entrance View', keyProps: ['门', '玄关'], keyPropsEn: ['door', 'entrance'], description: '入口Viewpoint', descriptionEn: 'Entrance view' },
        ...commonDefaults,
      ];
      
    case 'indoor_work':
      return [
        { id: 'study', name: '办公区', nameEn: 'Work Area', keyProps: ['书桌', '电脑'], keyPropsEn: ['desk', 'computer'], description: '办公区域', descriptionEn: 'Work area' },
        { id: 'window', name: '窗边', nameEn: 'Window View', keyProps: ['窗户'], keyPropsEn: ['window'], description: '窗边Viewpoint', descriptionEn: 'Window view' },
        { id: 'entrance', name: '入口', nameEn: 'Entrance View', keyProps: ['门'], keyPropsEn: ['door'], description: '入口Viewpoint', descriptionEn: 'Entrance view' },
        ...commonDefaults,
      ];
      
    case 'indoor_public':
      return [
        { id: 'seating', name: '坐席区', nameEn: 'Seating Area', keyProps: [], keyPropsEn: [], description: '坐席区域', descriptionEn: 'Seating area' },
        { id: 'entrance', name: '入口', nameEn: 'Entrance View', keyProps: ['门'], keyPropsEn: ['door'], description: '入口Viewpoint', descriptionEn: 'Entrance view' },
        ...commonDefaults,
      ];
    
    // === 古代Scene ===
    case 'ancient_indoor':
      return [
        { id: 'ancient_hall', name: '堂屋', nameEn: 'Main Hall', keyProps: ['太师椅', '案几'], keyPropsEn: ['taishi chair', 'table'], description: '堂屋Viewpoint', descriptionEn: 'Main hall view' },
        { id: 'ancient_table', name: '案几', nameEn: 'Ancient Table', keyProps: ['案几', '茶具'], keyPropsEn: ['table', 'tea set'], description: '案几Viewpoint', descriptionEn: 'Table view' },
        { id: 'ancient_screen', name: '屏风', nameEn: 'Screen View', keyProps: ['屏风', '帐幔'], keyPropsEn: ['screen', 'curtain'], description: '屏风Viewpoint', descriptionEn: 'Screen view' },
        { id: 'ancient_couch', name: '榻', nameEn: 'Ancient Couch', keyProps: ['榻', '软垫'], keyPropsEn: ['daybed', 'cushion'], description: '榻Viewpoint', descriptionEn: 'Couch view' },
        ...commonDefaults,
      ];
      
    case 'ancient_outdoor':
      return [
        { id: 'ancient_courtyard', name: '庭院', nameEn: 'Courtyard', keyProps: ['假山', '水池'], keyPropsEn: ['rockery', 'pond'], description: '庭院Viewpoint', descriptionEn: 'Courtyard view' },
        { id: 'ancient_pavilion', name: '亝子', nameEn: 'Pavilion', keyProps: ['亝', '石凳'], keyPropsEn: ['pavilion', 'stone bench'], description: '亝子Viewpoint', descriptionEn: 'Pavilion view' },
        { id: 'ancient_road', name: '官道', nameEn: 'Official Road', keyProps: ['官道'], keyPropsEn: ['road'], description: '官道Viewpoint', descriptionEn: 'Road view' },
        { id: 'ancient_gate', name: '城门', nameEn: 'City Gate', keyProps: ['城门', '城墙'], keyPropsEn: ['city gate', 'wall'], description: '城门Viewpoint', descriptionEn: 'City gate view' },
        ...commonDefaults,
      ];
      
    case 'ancient_vehicle':
      return [
        { id: 'ancient_sedan', name: '轿内', nameEn: 'Inside Sedan', keyProps: ['轿帘', '坐垫'], keyPropsEn: ['sedan curtain', 'cushion'], description: '轿内Viewpoint', descriptionEn: 'Inside sedan view' },
        { id: 'ancient_carriage', name: '车内', nameEn: 'Inside Carriage', keyProps: ['车篾', '坐垫'], keyPropsEn: ['canopy', 'cushion'], description: '车内Viewpoint', descriptionEn: 'Inside carriage view' },
        { id: 'ancient_boat', name: '船舱', nameEn: 'Boat Cabin', keyProps: ['船舱', '窗子'], keyPropsEn: ['cabin', 'window'], description: '船舱Viewpoint', descriptionEn: 'Boat cabin view' },
        { id: 'ancient_deck', name: '甲板', nameEn: 'Ship Deck', keyProps: ['甲板', '风帆'], keyPropsEn: ['deck', 'sail'], description: '甲板Viewpoint', descriptionEn: 'Deck view' },
        { id: 'ancient_horse', name: '马背', nameEn: 'On Horseback', keyProps: ['马', '马鞍'], keyPropsEn: ['horse', 'saddle'], description: '马背Viewpoint', descriptionEn: 'Horseback view' },
        ...commonDefaults,
      ];
      
    default:
      return commonDefaults;
  }
}

/**
 * 检查Viewpoint配置是否与环境类型兼容
 */
function isViewpointCompatibleWithEnvironment(
  config: ViewpointConfig,
  envType: SceneEnvironmentType
): boolean {
  // 空数组表示通用Viewpoint，适用于所有环境
  if (config.environments.length === 0) {
    return true;
  }
  // unknown 环境不做过滤，允许所有Viewpoint
  if (envType === 'unknown') {
    return true;
  }
  // 检查环境是否在兼容列表中
  return config.environments.includes(envType);
}

/**
 * 提取Viewpoint（不限数量）
 * Back所有识别到的Viewpoint，不再限制为6
 * 
 * Viewpoint是从Shot内容中提取的，不做环境过滤
 * 
 * @param shots Shot List
 * @param sceneLocation SceneLocation（仅用于补充默认Viewpoint）
 */
export function extractAllViewpointsFromShots(
  shots: Shot[],
  sceneLocation?: string
): SceneViewpoint[] {
  const viewpointMap = new Map<string, SceneViewpoint>();
  const matchedShotIds = new Set<string>();
  
  // 第一遍：根据Keywords匹配Shot到Viewpoint
  for (const shot of shots) {
    const searchText = getShotSearchableText(shot);
    let shotMatched = false;
    
    for (const [keyword, config] of Object.entries(VIEWPOINT_KEYWORDS)) {
      if (searchText.includes(keyword)) {
        shotMatched = true;
        
        if (!viewpointMap.has(config.id)) {
          viewpointMap.set(config.id, {
            id: config.id,
            name: config.name,
            nameEn: config.nameEn,
            shotIds: [shot.id],
            keyProps: [...config.propsZh],
            keyPropsEn: [...config.propsEn],
            description: '',
            descriptionEn: '',
            gridIndex: viewpointMap.size,
          });
        } else {
          const existing = viewpointMap.get(config.id)!;
          if (!existing.shotIds.includes(shot.id)) {
            existing.shotIds.push(shot.id);
          }
          for (const prop of config.propsZh) {
            if (!existing.keyProps.includes(prop)) {
              existing.keyProps.push(prop);
            }
          }
          for (const prop of config.propsEn) {
            if (!existing.keyPropsEn.includes(prop)) {
              existing.keyPropsEn.push(prop);
            }
          }
        }
      }
    }
    
    if (shotMatched) {
      matchedShotIds.add(shot.id);
    }
  }
  
  // 第二遍：将未匹配的Shot归入「Wide Shot」Viewpoint
  const unmatchedShots = shots.filter(s => !matchedShotIds.has(s.id));
  if (unmatchedShots.length > 0) {
    if (!viewpointMap.has('overview')) {
      viewpointMap.set('overview', {
        id: 'overview',
        name: 'Wide Shot',
        nameEn: 'Overview',
        shotIds: unmatchedShots.map(s => s.id),
        keyProps: [],
        keyPropsEn: [],
        description: '整体空间布局',
        descriptionEn: 'Overall spatial layout',
        gridIndex: viewpointMap.size,
      });
    } else {
      const overview = viewpointMap.get('overview')!;
      for (const shot of unmatchedShots) {
        if (!overview.shotIds.includes(shot.id)) {
          overview.shotIds.push(shot.id);
        }
      }
    }
  }
  
  // 按关联Shot数排序
  const viewpoints = Array.from(viewpointMap.values())
    .sort((a, b) => b.shotIds.length - a.shotIds.length);
  
  // 补充默认Viewpoint（Wide Shot和细节）
  const defaultViewpoints = [
    { id: 'overview', name: 'Wide Shot', nameEn: 'Overview', keyProps: [] as string[], keyPropsEn: [] as string[], description: '整体空间布局', descriptionEn: 'Overall spatial layout' },
    { id: 'detail', name: '细节', nameEn: 'Detail View', keyProps: [] as string[], keyPropsEn: [] as string[], description: '细节Close-up', descriptionEn: 'Detail close-up' },
  ];
  
  while (viewpoints.length < 6 && defaultViewpoints.length > 0) {
    const def = defaultViewpoints.shift()!;
    if (!viewpoints.some(v => v.id === def.id)) {
      viewpoints.push({
        ...def,
        shotIds: [],
        gridIndex: viewpoints.length,
      });
    }
  }
  
  viewpoints.forEach((v, i) => { v.gridIndex = i; });
  
  return viewpoints;
}

/**
 * 将Viewpoint分组为联合图页
 * 每页最多 6 Viewpoint
 */
export function groupViewpointsIntoPages(
  viewpoints: SceneViewpoint[],
  viewpointsPerPage: number = 6
): SceneViewpoint[][] {
  const pages: SceneViewpoint[][] = [];
  
  for (let i = 0; i < viewpoints.length; i += viewpointsPerPage) {
    const page = viewpoints.slice(i, i + viewpointsPerPage);
    // 重新分配页内 gridIndex (0-5)
    page.forEach((v, idx) => { v.gridIndex = idx; });
    pages.push(page);
  }
  
  return pages;
}

/**
 * 生成联合图的Prompt
 * Back PendingViewpointData 和 ContactSheetPromptSet 用于传递给Scene库
 * 
 * 布局Select逻辑：
 * - Viewpoint ≤ 6：使用 2x3 或 3x2（1 张图）
 * - Viewpoint 7-9：使用 3x3（1 张图）
 * - Viewpoint > 9：分多张图
 */
export function generateMultiPageContactSheetData(
  config: ContactSheetConfig,
  shots: Shot[] // 用于获取ShotIndex
): {
  viewpoints: PendingViewpointData[];
  contactSheetPrompts: ContactSheetPromptSet[];
} {
  const { scene, styleTokens, aspectRatio } = config;
  
  // 提取所有Viewpoint（传入SceneLocation进行环境过滤）
  const sceneLocation = scene.location || scene.name || '';
  const allViewpoints = extractAllViewpointsFromShots(config.shots, sceneLocation);
  
  // 根据Viewpoint数量和宽高比自动Select最优布局
  // 强制使用 NxN 布局 (2x2 或 3x3) 以保证宽高比一致性，与 Director 面板保持一致
  let gridLayout: { rows: number; cols: number };
  let viewpointsPerPage: number;
  
  const vpCount = allViewpoints.length;
  
  if (vpCount <= 4) {
    // 4 以内：使用 2x2
    gridLayout = { rows: 2, cols: 2 };
    viewpointsPerPage = 4;
  } else {
    // 超过 4 ：使用 3x3 (最多 9 一页)
    gridLayout = { rows: 3, cols: 3 };
    viewpointsPerPage = 9;
  }
  
  console.log('[ContactSheet] 布局Select:', { vpCount, aspectRatio, gridLayout, viewpointsPerPage });
  
  // 分页
  const pages = groupViewpointsIntoPages(allViewpoints, viewpointsPerPage);
  
  // 构建Scene基础描述
  const sceneDescEn = [
    scene.architectureStyle && `Architecture: ${scene.architectureStyle}`,
    scene.colorPalette && `Color palette: ${scene.colorPalette}`,
    scene.eraDetails && `Era: ${scene.eraDetails}`,
    scene.lightingDesign && `Lighting: ${scene.lightingDesign}`,
  ].filter(Boolean).join('. ');
  
  const sceneDescZh = [
    scene.architectureStyle && `建筑风格：${scene.architectureStyle}`,
    scene.colorPalette && `色彩基调：${scene.colorPalette}`,
    scene.eraDetails && `时代特征：${scene.eraDetails}`,
    scene.lightingDesign && `光影设计：${scene.lightingDesign}`,
  ].filter(Boolean).join('，');
  
  const styleStr = styleTokens.length > 0 
    ? styleTokens.join(', ') 
    : 'anime style, soft colors, detailed background';
  
  // 构建Shot ID 到Index的映射
  const shotIdToIndex = new Map<string, number>();
  shots.forEach(shot => {
    shotIdToIndex.set(shot.id, shot.index);
  });
  
  // 生成 PendingViewpointData
  const pendingViewpoints: PendingViewpointData[] = [];
  
  pages.forEach((pageViewpoints, pageIndex) => {
    pageViewpoints.forEach((vp, idx) => {
      // 生成Viewpoint描述
      const propsZh = vp.keyProps.length > 0 ? `，包含${vp.keyProps.join('、')}` : '';
      const propsEn = vp.keyPropsEn.length > 0 ? ` with ${vp.keyPropsEn.join(', ')}` : '';
      vp.description = `${vp.name}Viewpoint${propsZh}`;
      vp.descriptionEn = `${vp.nameEn} angle${propsEn}`;
      
      // 更新 gridIndex
      vp.gridIndex = idx;
      
      // 获取关联Shot的Index
      const shotIndexes = vp.shotIds
        .map(id => shotIdToIndex.get(id))
        .filter((idx): idx is number => idx !== undefined)
        .sort((a, b) => a - b);
      
      pendingViewpoints.push({
        id: vp.id,
        name: vp.name,
        nameEn: vp.nameEn,
        shotIds: vp.shotIds,
        shotIndexes,
        keyProps: vp.keyProps,
        keyPropsEn: vp.keyPropsEn,
        gridIndex: vp.gridIndex,
        pageIndex,
      });
    });
  });
  
  // 生成每页的 ContactSheetPromptSet
  const contactSheetPrompts: ContactSheetPromptSet[] = pages.map((pageViewpoints, pageIndex) => {
    const totalCells = gridLayout.rows * gridLayout.cols;
    const paddedCount = totalCells;
    const actualCount = pageViewpoints.length;
    
    // 构建增强版Prompt — 对齐导演面板 generateGridAndSlice 的三层风格夹击结构
    const promptParts: string[] = [];
    
    // 1. 核心指令区 (Instruction Block) — 使用与导演面板一致的 storyboard grid 术语
    promptParts.push('<instruction>');
    promptParts.push(`Generate a clean ${gridLayout.rows}x${gridLayout.cols} storyboard grid with exactly ${paddedCount} equal-sized panels.`);
    promptParts.push(`Overall Image Aspect Ratio: ${aspectRatio}.`);
    
    // 明确指定单格子的宽高比，防止 AI 混淆
    const panelAspect = aspectRatio === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
    promptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
    
    // 全局Visual Style（前置到指令区，权重最高 — 三层夹击第一层）
    if (styleStr) {
      promptParts.push(`MANDATORY Visual Style for ALL panels: ${styleStr}`);
    }
    
    promptParts.push('Structure: No borders between panels, no text, no watermarks, no speech bubbles.');
    promptParts.push('Consistency: Maintain consistent perspective, lighting, color grading, and visual style across ALL panels.');
    promptParts.push('Subject: Interior design and architectural details only, NO people.');
    promptParts.push('</instruction>');
    
    // 2. 布局描述
    promptParts.push(`Layout: ${gridLayout.rows} rows, ${gridLayout.cols} columns, reading order left-to-right, top-to-bottom.`);
    
    // 3. Scene信息
    if (sceneDescEn) {
      promptParts.push(`Scene Context: ${sceneDescEn}`);
    }
    
    // 4. 每格子的内容描述 — 每格附带 [same style] 锚定（三层夹击第二层）
    const styleAnchor = styleStr ? ' [same style]' : '';
    pageViewpoints.forEach((vp, idx) => {
      const row = Math.floor(idx / gridLayout.cols) + 1;
      const col = (idx % gridLayout.cols) + 1;
      
      const content = vp.keyPropsEn.length > 0 
        ? `showing ${vp.keyPropsEn.join(', ')}` 
        : (vp.nameEn === 'Overview' ? 'wide shot showing the entire room layout' : `${vp.nameEn} angle of the room`);
      
      promptParts.push(`Panel [row ${row}, col ${col}] (no people): ${content}${styleAnchor}`);
    });
    
    // 5. 空白占位格描述
    for (let i = actualCount; i < paddedCount; i++) {
      const row = Math.floor(i / gridLayout.cols) + 1;
      const col = (i % gridLayout.cols) + 1;
      promptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
    }
    
    // 6. 全局风格尾部再次强调（三层夹击第三层）
    if (styleStr) {
      promptParts.push(`IMPORTANT - Apply this EXACT style uniformly to every panel: ${styleStr}`);
    }
    
    // 7. 负面Prompt
    promptParts.push('Negative constraints: text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy, people, characters, distorted grid, uneven panels.');
    
    const prompt = promptParts.join('\n');

    // 中文Prompt
    const gridItemsZh = pageViewpoints.map((vp, i) => 
      `[${i + 1}] ${vp.name}：${vp.description}`
    ).join('\n');
    
    const promptZh = `一张精确的 ${gridLayout.rows}行${gridLayout.cols}列 网格图（Total ${totalCells} 格子），展示同一「${scene.name || scene.location}」Scene的不同Viewpoint。
${sceneDescZh}

${totalCells} 格子分别展示：${gridItemsZh}。

重要：
- 必须精确生成 ${gridLayout.rows} 行 ${gridLayout.cols} 列，不能多也不能少。
- 这是一张干净的Reference Image，Image上不要Add任何文字覆盖。
- 不要Add标签、标题、说明文字、水印或任何类型的文字。

风格：${styleTokens.length > 0 ? styleTokens.join('、') : '动画风格，柔和色彩，细节丰富'}，所有格子光照一致，格子之间用细白边框分隔，只有背景，没有人物。`;
    
    return {
      pageIndex,
      prompt,
      promptZh,
      viewpointIds: pageViewpoints.map(vp => vp.id),
      gridLayout,
    };
  });
  
  return {
    viewpoints: pendingViewpoints,
    contactSheetPrompts,
  };
}

/**
 * 从已有的 viewpoints 数据构建联合图数据
 * 用于从剧本面板跳转到Scene库时，直接使用 AI 分析的Viewpoint
 * 
 * @param viewpoints - 来自 ScriptScene.viewpoints 的Viewpoint数据
 * @param scene - Scene信息（用于生成Prompt）
 * @param shots - Shot List（用于获取ShotIndex）
 * @param styleTokens - 风格标记
 * @param aspectRatio - 宽高比
 */
export function buildContactSheetDataFromViewpoints(
  viewpoints: Array<{
    id: string;
    name: string;
    nameEn?: string;
    shotIds: string[];
    keyProps: string[];
    gridIndex: number;
  }>,
  scene: Pick<ScriptScene, 'name' | 'location' | 'architectureStyle' | 'lightingDesign' | 'colorPalette' | 'eraDetails' | 'visualPrompt' | 'visualPromptEn'>,
  shots: Shot[],
  styleTokens: string[],
  aspectRatio: '16:9' | '9:16' = '16:9'
): {
  viewpoints: PendingViewpointData[];
  contactSheetPrompts: ContactSheetPromptSet[];
} {
  // 根据Viewpoint数量Select布局
  const vpCount = viewpoints.length;
  let gridLayout: { rows: number; cols: number };
  let viewpointsPerPage: number;
  
  if (vpCount <= 4) {
    gridLayout = { rows: 2, cols: 2 };
    viewpointsPerPage = 4;
  } else {
    gridLayout = { rows: 3, cols: 3 };
    viewpointsPerPage = 9;
  }
  
  console.log('[buildContactSheetDataFromViewpoints] 使用 AI Viewpoint构建联合图数据:', {
    vpCount,
    gridLayout,
    viewpointsPerPage,
    // 调试：Scene美术设计字段
    sceneFields: {
      name: scene.name,
      location: scene.location,
      architectureStyle: scene.architectureStyle,
      lightingDesign: scene.lightingDesign,
      colorPalette: scene.colorPalette,
      eraDetails: scene.eraDetails,
    },
  });
  
  // 分页
  const pages: typeof viewpoints[] = [];
  for (let i = 0; i < viewpoints.length; i += viewpointsPerPage) {
    const page = viewpoints.slice(i, i + viewpointsPerPage);
    // 重新分配页内 gridIndex (0-based)
    page.forEach((v, idx) => { (v as any).gridIndex = idx; });
    pages.push(page);
  }
  
  // 构建Scene描述（美术设计字段）
  const sceneDescEn = [
    scene.architectureStyle && `Architecture: ${scene.architectureStyle}`,
    scene.colorPalette && `Color palette: ${scene.colorPalette}`,
    scene.eraDetails && `Era: ${scene.eraDetails}`,
    scene.lightingDesign && `Lighting: ${scene.lightingDesign}`,
  ].filter(Boolean).join('. ');
  
  const sceneDescZh = [
    scene.architectureStyle && `建筑风格：${scene.architectureStyle}`,
    scene.colorPalette && `色彩基调：${scene.colorPalette}`,
    scene.eraDetails && `时代特征：${scene.eraDetails}`,
    scene.lightingDesign && `光影设计：${scene.lightingDesign}`,
  ].filter(Boolean).join('，');
  
  // 视觉Prompt（AI Scene校准生成的详细Scene描述）
  const visualPromptZh = scene.visualPrompt || '';
  const visualPromptEn = scene.visualPromptEn || '';
  
  console.log('[buildContactSheetDataFromViewpoints] Scene描述:', {
    sceneDescZh,
    sceneDescEn,
    visualPromptZh: visualPromptZh ? visualPromptZh.substring(0, 50) + '...' : '(None)',
    visualPromptEn: visualPromptEn ? visualPromptEn.substring(0, 50) + '...' : '(None)',
  });
  
  const styleStr = styleTokens.length > 0 
    ? styleTokens.join(', ') 
    : 'anime style, soft colors, detailed background';
  
  // 构建Shot ID 到Index的映射
  const shotIdToIndex = new Map<string, number>();
  shots.forEach(shot => {
    shotIdToIndex.set(shot.id, shot.index);
  });
  
  // 生成 PendingViewpointData
  const pendingViewpoints: PendingViewpointData[] = [];
  
  pages.forEach((pageViewpoints, pageIndex) => {
    pageViewpoints.forEach((vp, idx) => {
      // 获取关联Shot的Index
      const shotIndexes = vp.shotIds
        .map(id => shotIdToIndex.get(id))
        .filter((idx): idx is number => idx !== undefined)
        .sort((a, b) => a - b);
      
      pendingViewpoints.push({
        id: vp.id,
        name: vp.name,
        nameEn: vp.nameEn || vp.name, // 如果没有英文名，使用中文名
        shotIds: vp.shotIds,
        shotIndexes,
        keyProps: vp.keyProps,
        keyPropsEn: [], // 可能没有英文道具名，留空
        gridIndex: idx,
        pageIndex,
      });
    });
  });
  
  // 生成每页的 ContactSheetPromptSet
  const contactSheetPrompts: ContactSheetPromptSet[] = pages.map((pageViewpoints, pageIndex) => {
    const totalCells = gridLayout.rows * gridLayout.cols;
    const paddedCount = totalCells;
    const actualCount = pageViewpoints.length;
    
    // 构建英文Prompt — 对齐导演面板三层风格注入
    const promptParts: string[] = [];
    
    // 计算每格的宽高比描述
    const panelAspect = aspectRatio === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
    
    promptParts.push('<instruction>');
    promptParts.push(`Generate a clean ${gridLayout.rows}x${gridLayout.cols} storyboard grid with exactly ${paddedCount} equal-sized panels.`);
    promptParts.push(`Overall Image Aspect Ratio: ${aspectRatio}.`);
    promptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
    // Layer 1: MANDATORY 风格前置（instruction 区内，最高优先级）
    promptParts.push(`MANDATORY Visual Style for ALL panels: ${styleStr}`);
    promptParts.push('Structure: No borders between panels, no text, no watermarks, no speech bubbles.');
    promptParts.push('Consistency: Maintain consistent perspective, lighting, color grading, and visual style across ALL panels.');
    promptParts.push('Subject: Interior design and architectural details only, NO people.');
    promptParts.push('</instruction>');
    
    promptParts.push(`Layout: ${gridLayout.rows} rows, ${gridLayout.cols} columns, reading order left-to-right, top-to-bottom.`);
    
    if (sceneDescEn) {
      promptParts.push(`Scene Context: ${sceneDescEn}`);
    }
    
    // Add视觉Prompt（英文）
    if (visualPromptEn) {
      promptParts.push(`Visual Description: ${visualPromptEn}`);
    }
    
    // 每格子的内容描述 + Layer 2: 每格风格锚定
    pageViewpoints.forEach((vp, idx) => {
      const row = Math.floor(idx / gridLayout.cols) + 1;
      const col = (idx % gridLayout.cols) + 1;
      const vpNameEn = vp.nameEn || vp.name;
      const content = vp.keyProps.length > 0 
        ? `showing ${vp.keyProps.join(', ')}` 
        : (vpNameEn === 'Overview' || vp.name === 'Wide Shot' ? 'wide shot showing the entire room layout' : `${vpNameEn} angle of the room`);
      
      promptParts.push(`Panel [row ${row}, col ${col}] (no people): ${content} [same style]`);
    });
    
    // 空白占位格
    for (let i = actualCount; i < paddedCount; i++) {
      const row = Math.floor(i / gridLayout.cols) + 1;
      const col = (i % gridLayout.cols) + 1;
      promptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
    }
    
    // Layer 3: 尾部风格强调（首尾夹击）
    promptParts.push(`IMPORTANT - Apply this EXACT style uniformly to every panel: ${styleStr}`);
    promptParts.push('Negative constraints: text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy, people, characters, distorted grid, uneven panels.');
    
    const prompt = promptParts.join('\n');
    
    // 中文Prompt
    const gridItemsZh = pageViewpoints.map((vp, i) => {
      const content = vp.keyProps.length > 0 
        ? `展示${vp.keyProps.join('、')}` 
        : (vp.name === 'Wide Shot' ? '展示整空间布局的宽角度Wide Shot' : `${vp.name}Viewpoint`);
      return `[${i + 1}] ${vp.name}：${content}`;
    }).join('\n');
    
    const promptZh = `一张精确的 ${gridLayout.rows}行${gridLayout.cols}列 网格图（Total ${totalCells} 格子），展示同一「${scene.name || scene.location}」Scene的不同Viewpoint。
${sceneDescZh}${visualPromptZh ? `\nScene氛围：${visualPromptZh}` : ''}

${totalCells} 格子分别展示：
${gridItemsZh}

重要：
- 必须精确生成 ${gridLayout.rows} 行 ${gridLayout.cols} 列，不能多也不能少。
- 这是一张干净的Reference Image，Image上不要Add任何文字覆盖。
- 不要Add标签、标题、说明文字、水印或任何类型的文字。

风格：${styleTokens.length > 0 ? styleTokens.join('、') : '动画风格，柔和色彩，细节丰富'}，所有格子光照一致，格子之间用细白边框分隔，只有背景，没有人物。`;
    
    return {
      pageIndex,
      prompt,
      promptZh,
      viewpointIds: pageViewpoints.map(vp => vp.id),
      gridLayout,
    };
  });
  
  return {
    viewpoints: pendingViewpoints,
    contactSheetPrompts,
  };
}
