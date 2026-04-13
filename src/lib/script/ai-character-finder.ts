// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Character Finder
 * 
 * 根据用户自然语言描述，从剧本中查找角色并生成专业角色数据
 * 
 * Feature：
 * 1. 解析用户输入（如 "缺第10Episode的王大哥这角色"）
 * 2. Search剧本中的Character Info
 * 3. AI 生成完整角色数据（包括视觉Prompt）
 */

import type { ScriptCharacter, ProjectBackground, EpisodeRawScript } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';

// ==================== 类型定义 ====================

export interface CharacterSearchResult {
  /** 是否找到角色 */
  found: boolean;
  /** 角色名 */
  name: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 出现的Episodes */
  episodeNumbers: number[];
  /** 找到的上下文（对白、Scene等） */
  contexts: string[];
  /** AI 生成的完整角色数据 */
  character?: ScriptCharacter;
  /** Search说明 */
  message: string;
}

/** @deprecated 不再需要手动传递，自动从服务映射获取 */
export interface FinderOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
}

// ==================== 核心函数 ====================

/**
 * 解析用户输入，提取角色名和Episodes信息
 */
function parseUserQuery(query: string): { name: string | null; episodeNumber: number | null } {
  let name: string | null = null;
  let episodeNumber: number | null = null;
  
  // 提取Episodes：第XEpisode、第X话、EP.X、EpX 等
  const episodeMatch = query.match(/第\s*(\d+)\s*[Episode话]|EP\.?\s*(\d+)|episode\s*(\d+)/i);
  if (episodeMatch) {
    episodeNumber = parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]);
  }
  
  // 提取角色名：常见模式
  // 1. "王大哥这角色" → 王大哥
  // 2. "缺张小宝这人" → 张小宝
  // 3. "需要李明" → 李明
  // 4. "角色：刀疤哥" → 刀疤哥
  
  // 移除Episodes相关文本
  let cleanQuery = query
    .replace(/第\s*\d+\s*[Episode话]/g, '')
    .replace(/EP\.?\s*\d+/gi, '')
    .replace(/episode\s*\d+/gi, '')
    .trim();
  
  // 模式1：X这角色/X这人
  let nameMatch = cleanQuery.match(/[「「"']?([^「」""'\s,，。！？]+?)[」」"']?\s*这[角色人]/);
  if (nameMatch) {
    name = nameMatch[1];
  }
  
  // 模式2：缺/需要/Add + 角色名
  if (!name) {
    // 先移除前缀动词，然后取剩余部分作为角色名
    nameMatch = cleanQuery.match(/^[缺需要Add找查想请帮我的]+\s*[「「"']?([^「」""'\s,，。！？这角色人]{2,8})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // 模式3：角色：/角色名：后面的内容
  if (!name) {
    nameMatch = cleanQuery.match(/角色[：:名]?\s*[「「"']?([^「」""'\s,，。！？]{2,8})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // 模式4：直接就是角色名（2-8字符）
  if (!name) {
    // 去掉常见动词和助词
    const pureQuery = cleanQuery.replace(/^[缺需要Add找查想请帮我的]+/g, '').trim();
    if (pureQuery.length >= 2 && pureQuery.length <= 8 && /^[\u4e00-\u9fa5A-Za-z]+$/.test(pureQuery)) {
      name = pureQuery;
    }
  }
  
  return { name, episodeNumber };
}

/**
 * 从剧本中Search角色
 */
function searchCharacterInScripts(
  name: string,
  episodeScripts: EpisodeRawScript[],
  targetEpisode?: number
): {
  found: boolean;
  episodeNumbers: number[];
  contexts: string[];
  dialogueSamples: string[];
  sceneSamples: string[];
} {
  const episodeNumbers: number[] = [];
  const contexts: string[] = [];
  const dialogueSamples: string[] = [];
  const sceneSamples: string[] = [];
  
  // 遍历剧本Search
  const scriptsToSearch = targetEpisode 
    ? episodeScripts.filter(ep => ep.episodeIndex === targetEpisode)
    : episodeScripts;
  
  for (const ep of scriptsToSearch) {
    if (!ep || !ep.scenes) continue;
    
    let foundInEpisode = false;
    
    for (const scene of ep.scenes) {
      if (!scene) continue;
      
      // 检查Scene人物列表
      const hasInCharacters = scene.characters?.some(c => 
        c === name || c.includes(name) || name.includes(c)
      );
      
      // 检查对白
      const relevantDialogues = scene.dialogues?.filter(d => 
        d.character === name || d.character.includes(name) || name.includes(d.character)
      ) || [];
      
      if (hasInCharacters || relevantDialogues.length > 0) {
        if (!foundInEpisode) {
          episodeNumbers.push(ep.episodeIndex);
          foundInEpisode = true;
        }
        
        // 收EpisodeScene信息
        if (sceneSamples.length < 3) {
          sceneSamples.push(`第${ep.episodeIndex}Episode - ${scene.sceneHeader || 'Scene'}`);
        }
        
      // 收Episode对白样本
        for (const d of relevantDialogues.slice(0, 3)) {
          if (dialogueSamples.length < 5) {
            dialogueSamples.push(`${d.character}: ${d.line.slice(0, 50)}${d.line.length > 50 ? '...' : ''}`);
          }
        }
        
        // 收Episode上下文
        if (contexts.length < 5) {
          const sceneContext = [
            `【${scene.sceneHeader || 'Scene'}】`,
            scene.characters?.length ? `人物: ${scene.characters.join(', ')}` : '',
            ...relevantDialogues.slice(0, 2).map(d => `${d.character}: ${d.line.slice(0, 30)}...`),
          ].filter(Boolean).join('\n');
          contexts.push(sceneContext);
        }
      }
    }
  }
  
  return {
    found: episodeNumbers.length > 0,
    episodeNumbers,
    contexts,
    dialogueSamples,
    sceneSamples,
  };
}

/**
 * 使用 AI 生成完整角色数据
 */
async function generateCharacterData(
  name: string,
  background: ProjectBackground,
  contexts: string[],
  dialogueSamples: string[]
): Promise<ScriptCharacter> {
  
  // 检测剧本类型：古装/未来/现代
  const detectStoryType = () => {
    const era = (background.era || '');
    const timeline = (background.timelineSetting || '');
    const genre = (background.genre || '');
    const outline = (background.outline || '');
    const startYear = background.storyStartYear;
    
    console.log('[detectStoryType] background:', {
      era,
      timeline,
      genre,
      storyStartYear: startYear,
      hasOutline: !!outline,
    });
    
    // 如果有明确的 storyStartYear 且是近现代年份（1800年以后），直接判定为现代剧
    if (startYear && startYear >= 1800) {
      console.log('[detectStoryType] 检测结果: modern (基于 storyStartYear:', startYear, ')');
      return 'modern';
    }
    
    // 如果 storyStartYear 不存在，尝试从 outline/era/timeline 中提取年份
    const textForYearExtraction = `${era} ${timeline} ${outline}`;
    const yearMatch = textForYearExtraction.match(/(19\d{2}|20\d{2})\s*年/);
    if (yearMatch) {
      const extractedYear = parseInt(yearMatch[1]);
      console.log('[detectStoryType] 检测结果: modern (从文本提取年份:', extractedYear, ')');
      return 'modern';
    }
    
    // 古装剧Keywords（明确的古代设定）
    const ancientKeywords = ['古代', '古装', '武侠', '仙侠', '唐朝', '宋朝', '明朝', '清朝', '汉朝', '三国', '战国', '秦朝', '宫廷', '皇宫', '江湖', '修仙', '玄幻', '神话', '传说', '朝代', '皇帝', '大臣', '太监', '妃子'];
    // 未来/科幻Keywords
    const futureKeywords = ['未来', '科幻', '太空', '星际', '机器人', '赛博朋克', '末日', '后启示录', '反乌托邦', '人工智能', '2100', '2200', '2300'];
    
    const allText = `${era} ${timeline} ${genre} ${outline}`;
    
    if (ancientKeywords.some(kw => allText.includes(kw))) {
      console.log('[detectStoryType] 检测结果: ancient (基于Keywords)');
      return 'ancient';
    }
    if (futureKeywords.some(kw => allText.includes(kw))) {
      console.log('[detectStoryType] 检测结果: future (基于Keywords)');
      return 'future';
    }
    console.log('[detectStoryType] 检测结果: modern (默认)');
    return 'modern';
  };
  
  const storyType = detectStoryType();
  
  // 根据剧本类型构建Costume指导
  const getEraFashionGuidance = () => {
    // 古装剧
    if (storyType === 'ancient') {
      const era = background.era || background.timelineSetting || '古代';
      return `【${era}Costume指导】
请根据剧本设定的历史时代设计Costume：
- 如果是客梨或武侠：古代汉服、侠客服饰、布衣草鞋
- 如果是宫廷：宫装、朝服、官服
- 如果是仙侠/玄幻：仙侠风格的服饰、飘逸长袍
请根据角色身份（平民/贵族/侠客/官员）设计合适的古代Costume。`;
    }
    
    // 未来/科幻剧
    if (storyType === 'future') {
      return `【未来/科幻Costume指导】
请根据剧本设定设计未来风格Costume：
- 科技感服饰、Feature性装备、智能穿戴
- 根据设定可以是乌托邦风格或反乌托邦风格
- 注意角色身份（平民/科学家/军人/机械师）`;
    }
    
    // 现代剧 - 根据具体年代
    const startYear = background.storyStartYear;
    
    if (startYear) {
      if (startYear >= 2020) {
        return `【${startYear}年代Costume指导】
- 年轻人：休闲时尚、运动风、潮牌元素，常穿卫衣、牵仔裤、运动鞋
- 中年人：商务休闲、简约现代，常穿Polo衫、休闲西装、卡其裤
- 老年人：舒适休闲，常穿开衫、单子衫、布鞋或运动鞋`;
      } else if (startYear >= 2010) {
        return `【${startYear}年代Costume指导】
- 年轻人：韩系时尚、小清新风格，常穿T恤、牵仔裤、帆布鞋
- 中年人：商务正装或商务休闲，常穿西装、衬衫、皮鞋
- 老年人：传统休闲，常穿开衫、布鞋`;
      } else if (startYear >= 2000) {
        return `【${startYear}年代Costume指导】
- 年轻人：千禧年时尚，常穿紧身裤、宽松外套、板鞋
- 中年人：正式商务装，常穿西装套装、领带、皮鞋
- 老年人：中山装或简单开衫、布鞋`;
      } else if (startYear >= 1990) {
        return `【${startYear}年代Costume指导】
- 年轻人：喇叭裤、的确良外套、大肩垫西装
- 中年人：中山装或西装，解放鞋或简单皮鞋
- 老年人：中山装、棉袄、布鞋`;
      } else {
        return `【${startYear}年代Costume指导】
请根据该年代的中国实际Costume风格设计`;
      }
    }
    
    // 默认现代
    return `【现代Costume指导】
请设计符合当代中国的Costume风格，根据角色Age和身份Select合适的现代Costume。`;
  };
  
  // 构建年代信息字符串
  const getEraInfo = () => {
    if (storyType === 'ancient') {
      return `时代背景：${background.era || background.timelineSetting || '古代'}`;
    }
    if (storyType === 'future') {
      return `时代背景：${background.era || background.timelineSetting || '未来'}`;
    }
    if (background.storyStartYear) {
      return `故事年份：${background.storyStartYear}年${background.storyEndYear && background.storyEndYear !== background.storyStartYear ? ` - ${background.storyEndYear}年` : ''}`;
    }
    return `时代背景：${background.era || background.timelineSetting || '现代'}`;
  };
  
  const eraInfo = getEraInfo();
  const eraFashionGuidance = getEraFashionGuidance();
  
  const systemPrompt = `你是专业的影Viewpoint色设计师，擅长从剧本信息中提炼角色特征并生成专业的角色数据。

请根据提供的剧本信息和角色上下文，生成完整的角色数据。

【Costume设计要求】
${eraFashionGuidance}

Costume必须与剧本时代背景一致，不要混淆不同时代的Costume风格。

【Output Format】
请BackJSON格式，包含以下字段：
{
  "name": "角色名",
  "gender": "Male/Female",
  "age": "Age描述，如 '30岁左右' 或 '中年'",
  "personality": "性格特点，2-3词",
  "role": "角色身份/Occupation/在剧中的作用",
  "appearance": "外貌特征描述（Costume必须符合年代）",
  "relationships": "与其他角色的关系",
  "visualPromptEn": "英文视觉Prompt，用于AIImage Generation，描述外貌、Costume（必须符合年代）、气质",
  "visualPromptZh": "中文视觉Prompt",
  "importance": "protagonist/supporting/minor"
}`;

  const userPrompt = `【剧本信息】
剧名：《${background.title}》
类型：${background.genre || 'Plot'}
${eraInfo}

【故事大纲】
${background.outline?.slice(0, 1000) || 'None'}

【人物小传】
${background.characterBios?.slice(0, 800) || 'None'}

【要分析的角色】
${name}

【角色出场上下文】
${contexts.slice(0, 3).join('\n\n')}

【Character Dialogue样本】
${dialogueSamples.join('\n')}

请基于以上信息，生成角色「${name}」的完整数据。

【重要】Costume必须符合故事时代背景（${eraInfo}）！`;

  try {
    // 统一从服务映射获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
    
    // 解析 JSON
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    // 确保所有字段都是字符串类型（AI 可能Back对象）
    const ensureString = (val: any): string | undefined => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'string') return val;
      if (typeof val === 'object') {
        // 如果是对象，尝试转换为字符串
        if (Array.isArray(val)) {
          return val.join(', ');
        }
        // 对象转换为键值对字符串
        return Object.entries(val)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
      }
      return String(val);
    };
    
    return {
      id: `char_${Date.now()}`,
      name: ensureString(parsed.name) || name,
      gender: ensureString(parsed.gender),
      age: ensureString(parsed.age),
      personality: ensureString(parsed.personality),
      role: ensureString(parsed.role),
      appearance: ensureString(parsed.appearance),
      relationships: ensureString(parsed.relationships),
      visualPromptEn: ensureString(parsed.visualPromptEn),
      visualPromptZh: ensureString(parsed.visualPromptZh),
      tags: [parsed.importance || 'minor', 'AI生成'],
    };
  } catch (error) {
    console.error('[generateCharacterData] AIGeneration failed:', error);
    // Back基础数据
    return {
      id: `char_${Date.now()}`,
      name,
      tags: ['AI生成'],
    };
  }
}

/**
 * 主函数：根据用户描述查找并生成角色
 */
export async function findCharacterByDescription(
  userQuery: string,
  background: ProjectBackground,
  episodeScripts: EpisodeRawScript[],
  existingCharacters: ScriptCharacter[],
  _options?: FinderOptions // 不再需要，保留以兼容
): Promise<CharacterSearchResult> {
  console.log('[findCharacterByDescription] 用户查询:', userQuery);
  
  // 1. 解析用户输入
  const { name, episodeNumber } = parseUserQuery(userQuery);
  
  if (!name) {
    return {
      found: false,
      name: '',
      confidence: 0,
      episodeNumbers: [],
      contexts: [],
      message: 'None法识别角色名。请用类似"缺第10Episode的王大哥"或"Add张小宝这角色"的方式描述。',
    };
  }
  
  console.log('[findCharacterByDescription] 解析结果:', { name, episodeNumber });
  
  // 2. 检查是否已存在
  const existing = existingCharacters.find(c => 
    c.name === name || c.name.includes(name) || name.includes(c.name)
  );
  
  if (existing) {
    return {
      found: true,
      name: existing.name,
      confidence: 1,
      episodeNumbers: [],
      contexts: [],
      message: `角色「${existing.name}」已存在于角色列表中。`,
      character: existing,
    };
  }
  
  // 3. 从剧本中Search
  const searchResult = searchCharacterInScripts(name, episodeScripts, episodeNumber || undefined);
  
  if (!searchResult.found) {
    // 没找到但可以让用户Confirm是否Create
    return {
      found: false,
      name,
      confidence: 0.3,
      episodeNumbers: [],
      contexts: [],
      message: episodeNumber 
        ? `在第 ${episodeNumber} Episode中未找到角色「${name}」。是否仍要Create这角色？`
        : `在剧本中未找到角色「${name}」。是否仍要Create这角色？`,
    };
  }
  
  // 4. 使用 AI 生成完整角色数据
  console.log('[findCharacterByDescription] Generating...角色数据...');
  
  const character = await generateCharacterData(
    name,
    background,
    searchResult.contexts,
    searchResult.dialogueSamples
  );
  
  // 计算置信度
  const confidence = Math.min(
    0.5 + searchResult.dialogueSamples.length * 0.1 + searchResult.episodeNumbers.length * 0.05,
    1
  );
  
  return {
    found: true,
    name: character.name,
    confidence,
    episodeNumbers: searchResult.episodeNumbers,
    contexts: searchResult.contexts,
    message: `找到角色「${character.name}」，出现在第 ${searchResult.episodeNumbers.join(', ')} Episode。`,
    character,
  };
}

/**
 * 仅Search（不调用AI），用于快速预览
 */
export function quickSearchCharacter(
  userQuery: string,
  episodeScripts: EpisodeRawScript[],
  existingCharacters: ScriptCharacter[]
): { name: string | null; found: boolean; message: string; existingChar?: ScriptCharacter } {
  const { name, episodeNumber } = parseUserQuery(userQuery);
  
  if (!name) {
    return { name: null, found: false, message: '请输入角色名' };
  }
  
  // 检查已存在
  const existing = existingCharacters.find(c => 
    c.name === name || c.name.includes(name) || name.includes(c.name)
  );
  
  if (existing) {
    return { 
      name: existing.name, 
      found: true, 
      message: `角色「${existing.name}」已存在`,
      existingChar: existing,
    };
  }
  
  // 快速Search
  const searchResult = searchCharacterInScripts(name, episodeScripts, episodeNumber || undefined);
  
  if (searchResult.found) {
    return {
      name,
      found: true,
      message: `找到「${name}」，出现在第 ${searchResult.episodeNumbers.join(', ')} Episode`,
    };
  }
  
  return {
    name,
    found: false,
    message: `未在剧本中找到「${name}」`,
  };
}
