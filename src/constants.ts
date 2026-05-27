export type Question = {
  category: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  source: string;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  image: string;
  questions: Question[];
};

const logoBlue =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCuLi4RNp-ye_GMzjXLa79N3CY4kWfek4qweugHBdfsJdkHyxrsM8VH5k8Xt2T-2v1xLbjpuV1yOK-po3sDAa_Enbx9LG4rrSssi6LXhBSsU59W1MnUbGnUGtlduwM0oJ_VNc4_FsMah6joHIHmHsxmtb--EJsR2YrUcvKD1Ke_fBxHiy1oae_SC5VkZmRT8Uq8gEL9VzCvD5iU4DLuC4Oq3xViL07lwtSepNsxB4qZUPLZs1Q5FSH5Egi5Rua7OVh4ou88eFtF_oQ';

const logoWhite =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCHQ73zIg4mElvcf1pH4yOrCN5dZvpdT8vTJpTN6yH5TRGYOVPAiLNZxoZyALJP0m201eW2tede0gEBVfNza86QLbBxfXXrChj-GgqqqlelBWfm2A6c41lcZ1xHsh7FWAtihFKdE4VwcOEGVc3kD8FdMZW_e-96gRxHdjGU8HxxhuBW6RJH3tQ1PM7MEp3ZTpa2WvfttT7RgyAHd_h9tPfv5D0vmzk0F-nKhSQGjs60KOtQCYf6CrsGBZOL38JKTaoehmJiWmEIkVc';

const deviceIcon =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBT7crgc5JCiEN9sjP5UziTiTVkLKl0zNhf7xI-5vCNRmvekaN5YJCDlhATn7RBHNV5RKEItmT1LvQdSJih9HW3YPUEX6ikFTlY2wQ3OajC5S9Fh6oZkDuKTIRv6aWYiN01MT5yjSSFRXWTEtLFXMMduILggvI8AnPOxGV4nkRBKm4I71kX0JBxgB-M95eqp7An3oGjlxV94NqIwHz90TnYLLlZ5r60D8VE8OZG74qIrDlLxY7t5l2TesGYxKOG28lGc88guNxr6FY';

export const QUIZ_LENGTH = 32;

const stableOptionIndex = (seed: string) => {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }

  return hash % 4;
};

const makeQuestion = (
  category: string,
  source: string,
  text: string,
  correct: string,
  wrongA: string,
  wrongB: string,
  wrongC: string,
  explanation: string,
): Question => {
  const correctIndex = stableOptionIndex(`${category}:${text}`);
  const options = [wrongA, wrongB, wrongC];
  options.splice(correctIndex, 0, correct);

  return {
    category,
    source,
    text,
    options,
    correctIndex,
    explanation,
  };
};

export const PRODUCTS: Product[] = [
  {
    id: 'ndi-network-foundation',
    name: 'NDI 与网络基础',
    description: '理解 NDI、NDI HX、网络发现、分组和基础工作流。',
    image: logoBlue,
    questions: [
      makeQuestion(
        'NDI 与网络基础',
        'NDI 从零开始指南 / AVX24-4 产品介绍',
        'NDI 的核心价值最接近哪一种描述？',
        '通过 IP 网络实时传输视频、音频和元数据',
        '通过 IP 网络传输视频，但不包含音频和元数据',
        '主要用于把 SDI 信号压缩成离线文件',
        '只负责设备发现，实际音视频仍依赖 HDMI/SDI 线缆',
        'NDI 是基于 IP 网络的实时音视频和元数据传输标准。',
      ),
      makeQuestion(
        'NDI 与网络基础',
        'NDI 从零开始指南',
        '小型局域网中的 NDI 为什么容易上手？',
        '设备在同一网络中可自动发现，接近即插即用',
        '所有 NDI 设备都必须先接入 Discovery Server 才能工作',
        '只要带宽足够，就完全不需要考虑交换机和网段',
        '它默认要求每台设备配置固定公网 IP',
        '资料强调 NDI 在同一局域网中可通过发现机制降低入门门槛。',
      ),
      makeQuestion(
        'NDI 与网络基础',
        'NDI 从零开始指南',
        'NDI HX 相比高带宽 NDI 更适合什么场景？',
        '带宽受限、移动设备或 WiFi 传输场景',
        '对多代编解码稳定性要求最高的演播室主链路',
        '必须保持帧内压缩并尽量避免 GOP 的制作链路',
        '只在局域网内进行无压缩 4K 基带替代的场景',
        'NDI HX 使用 H.264/H.265 降低带宽，适合轻量化和受限网络。',
      ),
      makeQuestion(
        'NDI 与网络基础',
        'NDI 从零开始指南',
        'Discovery Server 主要解决什么问题？',
        '大型网络和跨网段环境中的集中发现管理',
        '提升单路 NDI HX 的编码画质和压缩效率',
        '将所有 NDI 传输强制改为组播并关闭单播',
        '替代矩阵切换系统，直接完成信号调度和上屏',
        'Discovery Server 适合大型网络、跨子网和集中管理场景。',
      ),
      makeQuestion(
        'NDI 与网络基础',
        'NDI 从零开始指南',
        'NDI 分组的主要作用是什么？',
        '按业务或区域控制 NDI 源的可见范围',
        '提高 NDI 高带宽流的码率上限',
        '让跨公网传输自动具备聚合链路能力',
        '把所有源统一转成代理流以降低预览带宽',
        'NDI 分组可用于组织和隔离不同业务范围内的设备可见性。',
      ),
      makeQuestion(
        'NDI 与网络基础',
        'AVX24-4 产品介绍',
        'AV over IP 项目中，资料提到的典型挑战是什么？',
        'IP 网络不可见、需要 IT+AV 技能、跨品牌跨团队',
        '主要难点是 NDI 不支持多画面监看和信号调度',
        '只要使用千兆交换机，就不需要关注网络拓扑和链路状态',
        '所有品牌设备都能自动显示详细型号和端口状态，无需协议支持',
        'AVX24-4 资料将 IP 可视化和简易管控作为核心需求来源。',
      ),
    ],
  },
  {
    id: 'product-series',
    name: '产品系列总览',
    description: '识别 N50/N60、E3、P3、D350、RF02、AVX24-4 等产品定位。',
    image: deviceIcon,
    questions: [
      makeQuestion(
        '产品系列总览',
        '千视电子产品系列 2026 第一版',
        'N50/N60 在产品系列中被定位为什么？',
        '4K NDI + NDI HX 全能编解码器',
        '仅支持 NDI HX 的轻量级解码器，不支持高带宽 NDI',
        '主要用于 KiloLink 聚合接收，不承担 SDI/HDMI 编解码',
        '只面向 SRT/RTMP 推流，不能进入 NDI 制作链路',
        '产品系列资料将 N50/N60 作为重点推荐的 4K NDI 全能编解码器。',
      ),
      makeQuestion(
        '产品系列总览',
        '千视电子产品系列 2026 第一版',
        'E3 多接口编码器的典型接口组合是什么？',
        '3G-SDI、4K30 HDMI 和高清 USB',
        '12G-SDI、4K60 HDMI 和 10G 光口',
        '4 路 SDI 同步输出和 1 路 4K HDMI 监看输出',
        '双 5G 模块、内置电池和 KiloLink 聚合接收接口',
        'E3 资料强调 3G-SDI、4K30 HDMI、高清 USB 三接口和双路编码能力。',
      ),
      makeQuestion(
        '产品系列总览',
        '千视电子产品系列 2026 第一版',
        'P3 5G 聚合编码器主要面向什么需求？',
        '4G/5G 聚合、移动直播和弱网回传',
        '固定演播室内的 24 路 4K NDI 矩阵切换',
        '报告厅内多路 HDMI/SDI 的机架式集中采集编码',
        '本地局域网内 NDI 源的拓扑可视化和端口监测',
        'P3 资料强调模块化 4G/5G、长续航、低延时和 KiloLink 聚合算法。',
      ),
      makeQuestion(
        '产品系列总览',
        '千视电子产品系列 2026 第一版',
        'D350 更适合在方案中承担什么角色？',
        '解码输出和多画面监看相关角色',
        '4G/5G 聚合编码和弱网无线回传',
        'AVX 集群统一 Web UI 管理',
        'RF02 内部主控板卡和协议转换中枢',
        '产品系列和案例中多次将 D350 用于解码、监看或回传输出链路。',
      ),
      makeQuestion(
        '产品系列总览',
        '千视电子产品系列 2026 第一版',
        'RF02 在产品系列中更接近什么定位？',
        '一站式媒体平台和模块化全流程方案载体',
        '只负责单路 HDMI 到 NDI 的桌面级编码',
        '专门用于 P3 聚合接收，不支持板卡式扩展',
        '只提供网络拓扑可视化，不参与采集、制作和监看',
        '资料将 RF02 与采集、制作、监看、协议转换和多板卡组合关联。',
      ),
      makeQuestion(
        '产品系列总览',
        'Kiloview 新员工培训 第三周',
        '新员工理解产品方案时，最重要的思路是什么？',
        '先理解场景需求，再匹配信号链路和产品组合',
        '优先按产品发布时间排序，默认推荐最新型号',
        '先确定客户预算，再把所有功能压缩到单一设备',
        '只根据输入接口类型选择产品，不分析制作、监看和管理链路',
        '培训和案例资料都围绕场景、链路、能力模块来理解产品。',
      ),
    ],
  },
  {
    id: 'avx24-media-hub',
    name: 'AVX24-4 Media HUB',
    description: '掌握 AVX24-4 的可视化、矩阵、PTP、集群和管理价值。',
    image: logoWhite,
    questions: [
      makeQuestion(
        'AVX24-4 Media HUB',
        'AVX24-4 产品介绍',
        'AVX24-4 和普通交换机最核心的区别是什么？',
        '它是 IP 媒体网络监测管控平台，交换只是基础功能之一',
        '它只是带 PoE 的普通二层交换机，不参与媒体流管理',
        '它主要用于 P 系列聚合接收，不提供拓扑和矩阵能力',
        '它只是一套软件服务，需要用户自行准备 Linux 服务器',
        'FAQ 明确说明 AVX24-4 不同于普通交换机，是媒体网络监测管控平台。',
      ),
      makeQuestion(
        'AVX24-4 Media HUB',
        'AVX24-4 产品介绍',
        'AVX24-4 的可视化能力主要让用户看到什么？',
        '设备、端口、NDI 流信号状态和网络拓扑',
        '只显示交换机端口是否通电，不识别 NDI 流状态',
        '只显示千视设备名称，第三方设备完全不能纳入拓扑',
        '只显示 NDI 源列表，不关联端口、设备和链路结构',
        '资料说明用户可以清晰看到每台设备、端口、每路 NDI 流状态。',
      ),
      makeQuestion(
        'AVX24-4 Media HUB',
        'AVX24-4 产品介绍',
        '单台 AVX24-4 支持的典型 4K NDI 输入切换能力是多少？',
        '24 路 4K NDI',
        '12 路 4K NDI，集群后固定上限仍为 12 路',
        '48 路 4K NDI，且不区分高带宽和 HX 模式',
        '24 路高清 NDI，4K 场景必须依赖外部矩阵',
        '资料和 FAQ 多次提到单台 AVX 支持 24 路 4K NDI 或 48 路高清。',
      ),
      makeQuestion(
        'AVX24-4 Media HUB',
        'AVX24-4 产品介绍',
        'AVX24-4 集群的意义是什么？',
        '将 NDI 信号切换能力从单台 24 路扩展为 N 倍 24 路',
        '只用于把多台设备的前面板 UI 同步显示',
        '把所有 NDI 流转换成单播，无法增加矩阵容量',
        '只用于冗余备份，不参与信号切换能力扩展',
        'FAQ 说明集群可实现矩阵能力堆叠，并由 KiloLink Station 统一管理。',
      ),
      makeQuestion(
        'AVX24-4 Media HUB',
        'AVX24-4 产品介绍',
        'AVX24-4 支持 PTP/IEEE1588 的意义是什么？',
        '适应需要时钟同步的专业场景',
        '让 NDI HX 的 GOP 长度自动缩短到帧内压缩',
        '替代 Discovery Server 完成跨网段发现',
        '让所有 NDI 流自动变为公网可访问',
        '资料提到 AVX24-4 支持 IEEE1588 的 TC 和 BC 模式。',
      ),
      makeQuestion(
        'AVX24-4 Media HUB',
        'AVX24-4 产品介绍',
        'AVX24-4 适合哪类典型场景？',
        '广电演播室、转播车、EFP、报告厅、体育场等大规模 NDI 调度',
        '单机位手机直播，只需要一路 RTMP 推流',
        '只需要 P3 聚合接收和 SDI 同步解码输出的户外机位',
        '不涉及 NDI 调度、拓扑或多源管理的普通办公网络',
        '产品介绍列出了广电、转播车、报告厅、体育场等大规模信号调度场景。',
      ),
    ],
  },
  {
    id: 'kilolink-station',
    name: 'KiloLink Station',
    description: '理解硬件化管理、P 系列聚合接收、同步输出和典型应用。',
    image: deviceIcon,
    questions: [
      makeQuestion(
        'KiloLink Station',
        'KiloLink Station 产品介绍',
        '为什么要研发 KiloLink Station 硬件？',
        '降低部署门槛，提供专属服务器和硬件同步输出',
        '把 AVX24-4 的矩阵能力直接扩展到 24*N 路',
        '让 N50/N60 不再需要接入任何交换网络',
        '主要解决普通交换机无法提供 PoE 供电的问题',
        '资料对比软件方案的部署难、服务器共用和无同步输出问题。',
      ),
      makeQuestion(
        'KiloLink Station',
        'KiloLink Station 产品介绍',
        'KiloLink Station 与 KiloLink Server Pro 的关系是什么？',
        '硬件内置 KiloLink Server Pro，免服务器部署',
        'Station 是 Server Pro 的云端订阅版，必须部署在公网服务器',
        'Station 只负责 SDI 解码，不能做设备集中管理',
        'Server Pro 是 AVX24-4 的前面板系统，不能用于 Station',
        '产品介绍说明 Station 内置 KiloLink Server Pro，可免部署使用。',
      ),
      makeQuestion(
        'KiloLink Station',
        'KiloLink Station 产品介绍',
        'KiloLink Station 专业/解码相关版本提供什么输出能力？',
        '4 路 SDI 同步输出和 1 路 4K HDMI 监看输出',
        '24 路 4K NDI 输入和 24 路 NDI 输出矩阵切换',
        '1 路 HDMI 输出，但不支持四画面监看',
        '4 路 HDMI 异步输出，不提供 SDI 同步输出',
        '资料多次提到 4 路 SDI 同步输出和 1 路 4K HDMI 输出。',
      ),
      makeQuestion(
        'KiloLink Station',
        'KiloLink Station 产品介绍',
        'KiloLink Station 当前阶段最多支持几台 P3 同时聚合接收？',
        '8 台 P3',
        '4 台 P3，且每台只能推送 1 路流',
        '16 台 P3，但需要额外部署 KiloLink Server Pro 软件',
        '24 台 P3，对应 AVX24-4 的 24 路输入能力',
        'FAQ 明确说明目前阶段支持 8 台 Kilolink P3 同时接入。',
      ),
      makeQuestion(
        'KiloLink Station',
        'KiloLink Station 产品介绍',
        '如果 Station 完全在内网且外网不可达，远端 P 系列通常需要什么？',
        '客户 IT 提供 VPN、端口映射或专线等可达方式',
        '只要在 P 系列后台输入 Station IP，即使不可达也能自动穿透',
        '必须把 Station 改成 AVX24-4 才能完成远端接入',
        '只需要更换为 NDI HX3 格式即可绕过网络可达性问题',
        'FAQ 区分了公网可达和完全内网不可达两种情况。',
      ),
      makeQuestion(
        'KiloLink Station',
        'KiloLink Station 产品介绍',
        'KiloLink Station 的典型应用场景包括什么？',
        '体育赛事、会议论坛、教育双师课堂等多机位聚合接收场景',
        '只做固定演播室 24 路 NDI 矩阵调度',
        '只做单设备状态监测，不处理聚合接收和输出',
        '只用于普通办公网交换，不参与媒体流处理',
        'FAQ 中列出体育赛事、活动执行、会议论坛、教育双师课堂等场景。',
      ),
    ],
  },
  {
    id: 'rf02-platform',
    name: 'RF02 场景流程',
    description: '理解 RF02 在采集、制作、监看、聚合、协议转换中的角色。',
    image: logoBlue,
    questions: [
      makeQuestion(
        'RF02 场景流程',
        'RF02 应用场景流程图',
        'RF02 在 NDI 制作系统解决方案中的核心特点是什么？',
        '单台即可完成采集、制作、监看全流程',
        '必须依赖外部交换机才能接入 NDI 制作和录制系统',
        '只能作为单路协议转换器，不能承载制作和监看',
        '主要用于 AVX24-4 集群管理，不参与采集链路',
        'RF02 流程图说明单台 RF02 可完成采集、制作、监看全流程。',
      ),
      makeQuestion(
        'RF02 场景流程',
        'RF02 应用场景流程图',
        'RF02 方案中外接交换机的用途是什么？',
        '按需接入外部远端信号源',
        '作为 RF02 必选核心，否则本机无法完成采集和监看',
        '用于替代 FN-50/FN-60 编解码板卡',
        '只用于把 P3 聚合信号转换成 SDI 同步输出',
        '流程图说明可外接交换机接入外部远端信号源。',
      ),
      makeQuestion(
        'RF02 场景流程',
        'RF02 应用场景流程图',
        'P3 聚合推流直播方案中，RF02 主控板卡承担什么角色？',
        '接收 P3/P3 mini 信号并通过 KiloLink 私有协议分发',
        '直接完成 4 路 SDI 同步解码输出，替代 KiloLink Station',
        '只负责本地 NDI 多画面监看，不参与 P 系列信号接收',
        '把所有 P3 信号强制转为 NDI HB 后再进入 AVX24-4',
        '流程图说明 RF02 内置主控板卡和 KiloLink Server Pro 服务。',
      ),
      makeQuestion(
        'RF02 场景流程',
        'RF02 应用场景流程图',
        'RF02 中 FMG-400 在 P3 聚合方案里可以做什么？',
        '转码、转协议和多平台推流直播',
        '只负责 SDI/HDMI 采集编码，不承担协议转换',
        '作为 RF02 主控板卡接收 P3/P3 mini 聚合信号',
        '提供 24 路 4K NDI 矩阵切换和拓扑可视化',
        '流程图说明 FMG-400 媒体网关卡可用于转码、协议转换和多平台推流。',
      ),
      makeQuestion(
        'RF02 场景流程',
        'RF02 应用场景流程图',
        'RF02 中 FN-50/FN-60 这类板卡通常承担什么任务？',
        'SDI/HDMI 采集编码和编解码转换',
        'P3/P3 mini 远端聚合接收和 Web UI 统一管理',
        'AVX24-4 集群管理和 PTP 时钟同步',
        'FMG-400 多平台推流和跨协议媒体网关',
        'RF02 流程图中 FN-50/FN-60 与 12G-SDI、4K HDMI 采集编码相关。',
      ),
      makeQuestion(
        'RF02 场景流程',
        'RF02 应用场景流程图',
        'FD-360 在 RF02 场景中被用于什么？',
        '多路信号多画面监看',
        '接收 P3 信号并通过 KiloLink 私有协议分发',
        '作为 NDI 制作系统运行导播软件',
        '完成 SDI/HDMI 到 NDI 的采集编码',
        '流程图中 FD-360 被标注为多画面监看相关模块。',
      ),
    ],
  },
  {
    id: 'broadcast-cases',
    name: '广电行业案例',
    description: '覆盖演播室、活动直播、电竞、真人秀、赛事转播和主分会场。',
    image: logoWhite,
    questions: [
      makeQuestion(
        '广电行业案例',
        '千视用户案例（广电行业）2026_01_23',
        '广电演播室 NDI IP 化项目通常关注哪组能力？',
        '节目制作、监看、调度分发、录制和直播',
        '只完成单机位编码，不涉及调度、录制和监看',
        '主要解决公网弱网回传，不关注演播室内制作链路',
        '只做 NDI 源发现，不涉及制作系统和多画面监看',
        '广电案例中演播室项目反复出现节目制作、监看、调度、录制、直播等关键词。',
      ),
      makeQuestion(
        '广电行业案例',
        '千视用户案例（广电行业）2026_01_23',
        '活动直播中 N50/N60 常用于什么？',
        '把现场多机位信号编码成 NDI 并参与制作、监看和上屏',
        '作为 KiloLink Station 的硬件服务器接收 P3 聚合流',
        '用于替代 AVX24-4 进行网络拓扑可视化和矩阵集群',
        '只作为 D350 的监看输出端，不参与现场信号采集',
        '活动直播案例多次使用 N50/N60 将现场信号转换为 NDI 工作流。',
      ),
      makeQuestion(
        '广电行业案例',
        '千视用户案例（广电行业）2026_01_23',
        'P 系列聚合编码器在广电案例中的典型价值是什么？',
        '4G/5G 多网聚合、弱网回传和轻量化移动拍摄',
        '在固定演播室内替代 NDI 矩阵完成 24 路切换',
        '主要作为 12G-SDI 高带宽 NDI 编解码器使用',
        '用于本地报告厅多画面监看，不处理移动回传',
        '活动直播、真人秀、户外赛事案例均强调 P 系列聚合传输能力。',
      ),
      makeQuestion(
        '广电行业案例',
        '千视用户案例（广电行业）2026_01_23',
        '电竞直播或电竞观察室项目常见需求是什么？',
        '高画质、低延时、多画面监看和多通道录制',
        '主要是 4G/5G 弱网回传，不需要本地监看和录制',
        '只需要单路解码上屏，不涉及多机位制作',
        '只需要设备集中管理，不需要画面处理和录制链路',
        '电竞案例中出现高画质、低延时、制作直播、多画面监看和录制。',
      ),
      makeQuestion(
        '广电行业案例',
        '千视用户案例（广电行业）2026_01_23',
        '主分会场和应急演练案例通常强调什么？',
        '低延时、低成本、主分会场互动和稳定回传',
        '主要强调演播室内部的 4K NDI 矩阵级联',
        '只关注本地多画面监看，不需要跨地域互动',
        '重点是 PTP 时钟同步，而不是信号回传与互动',
        '广电案例中主分会场、发布会、应急演练都围绕互动和低延时回传。',
      ),
      makeQuestion(
        '广电行业案例',
        '千视用户案例（广电行业）2026_01_23',
        '赛事转播车案例中，NDI IP 化的作用是什么？',
        '扩展转播车通道并支持新媒体节目制作直播',
        '只用于车内办公网络交换，不进入节目制作链路',
        '把所有现场信号改为本地录制，不再进行直播制作',
        '只解决公网推流问题，不涉及转播车内通道扩展',
        '赛事转播案例提到 4K 高质量、转播车通道扩展、新媒体制作直播。',
      ),
    ],
  },
  {
    id: 'ndi-ob-van',
    name: 'NDI 转播车方案',
    description: '理解 4K、5G、竖屏、云制作、轻量化转播车建设逻辑。',
    image: deviceIcon,
    questions: [
      makeQuestion(
        'NDI 转播车方案',
        '4K 5G NDI 转播车简介',
        '建设 NDI 转播车的大背景是什么？',
        'IP 化、轻量化、低成本和 4K/5G/云制作等技术创新',
        '主要为了保留传统 SDI 全基带架构，减少 IP 设备使用',
        '为了把所有现场机位集中到固定演播室，不再做外场制作',
        '为了只做单路 RTMP 推流，避免多机位制作和监看',
        '转播车资料开篇强调 IP 化轻量化、低成本市场和技术创新。',
      ),
      makeQuestion(
        'NDI 转播车方案',
        '4K 5G NDI 转播车简介',
        'NDI 转播车适合承载哪类制作模式？',
        '4K、竖屏、5G 和云制作等轻量化制作',
        '只适合传统 SDI 车内点对点基带制作',
        '只适合固定报告厅录播，不适合外场赛事制作',
        '只适合 P3 单机位回传，不需要制作、监看和录制链路',
        '资料将 4K、竖屏、5G、云制作作为转播车创新方向。',
      ),
      makeQuestion(
        'NDI 转播车方案',
        '4K 5G NDI 转播车简介',
        'NDI 技术成熟对转播车方案意味着什么？',
        '可以在大范围应用中支撑 IP 化制作和信号互联',
        '只能在同一交换机下做测试，不适合实际节目制作',
        '主要用于设备发现，不参与真实音视频制作链路',
        '只适合低码率预览，不能承载 4K 制作需求',
        '资料将 NDI 技术成熟和大范围应用列为建设原因之一。',
      ),
      makeQuestion(
        'NDI 转播车方案',
        '千视用户案例（广电行业）2026_01_23',
        '现场多机位信号进入 NDI 转播车后通常会进行什么处理？',
        '解码、集中监看、导播切换、图文包装和音频混合',
        '只进入 P 系列聚合服务器，不再进入导播和包装链路',
        '只做 NDI 源发现和分组，不参与节目制作',
        '只转换成代理流供预览，不保留主质量制作信号',
        '广电赛事转播案例描述了 NDI 转播车内的制作链路。',
      ),
      makeQuestion(
        'NDI 转播车方案',
        '4K 5G NDI 转播车简介 / 广电案例',
        '5G/4G 聚合在转播车或户外赛事中解决什么问题？',
        '弱网环境下的无线回传和轻量化部署',
        '固定演播室内多路 4K NDI 矩阵调度',
        '局域网内 NDI 拓扑可视化和端口状态监测',
        'SDI/HDMI 机架式采集编码，不涉及公网回传',
        'P 系列和转播车资料都将移动回传、弱网传输和部署简单作为价值点。',
      ),
      makeQuestion(
        'NDI 转播车方案',
        '4K 5G NDI 转播车简介',
        'NDI 转播车方案的产品学习重点应是什么？',
        '理解采集、传输、制作、监看、录制、上屏的完整链路',
        '只记住 NDI 和 5G 两个关键词，不需要拆解链路',
        '优先按单品型号背诵，不需要理解产品之间如何协同',
        '只判断编码器数量，不考虑制作、监看、录制和输出',
        '转播车是一套链路型方案，需要从完整制作链路理解产品组合。',
      ),
    ],
  },
  {
    id: 'proav-cases',
    name: 'ProAV 行业案例',
    description: '覆盖教育、会议、体育、医疗、剧院和特殊行业项目。',
    image: logoBlue,
    questions: [
      makeQuestion(
        'ProAV 行业案例',
        '千视用户案例（ProAV 行业）2026_01_23',
        '多校区互动项目的核心需求是什么？',
        '不同校区之间的音视频信号互联互通和低延时互动',
        '只在单一报告厅内进行 4K 本地录制和上屏',
        '主要做公网弱网移动直播，不涉及校区间固定互联',
        '只做设备集中升级管理，不关心音视频互动效果',
        'ProAV 案例中多校区项目强调信号编码传输解码和校区间互动。',
      ),
      makeQuestion(
        'ProAV 行业案例',
        '千视用户案例（ProAV 行业）2026_01_23',
        '报告厅 IP 化升级通常包含哪些能力？',
        '4K 采集、切换上屏、录制直播、多画面处理和监看',
        '只部署 P3 聚合编码器，依赖公网回传到导播车',
        '只做 NDI 源发现，不处理信号上屏和录制',
        '只需要 KiloLink Station 聚合接收，不需要采集和切换',
        '多个报告厅案例都围绕 4K、多信号切换、录制直播和监看展开。',
      ),
      makeQuestion(
        'ProAV 行业案例',
        '千视用户案例（ProAV 行业）2026_01_23',
        '会议互联互通项目常见目标是什么？',
        '多会议室信号互通、统一控制和会议制作直播',
        '只在单个会议室内做单路 HDMI 延长',
        '重点是户外 5G 弱网回传，而不是固定会议空间互通',
        '只需要本地录制，不涉及跨会议室调度和统一控制',
        '会议案例强调会议室信号互联互通、统一控制、制作直播。',
      ),
      makeQuestion(
        'ProAV 行业案例',
        '千视用户案例（ProAV 行业）2026_01_23',
        '医疗示教项目为什么需要集中录制和远程指导？',
        '便于手术过程示教、质控、远程观摩和协同教学',
        '主要用于院内办公网拓扑可视化，不涉及手术信号链路',
        '只为了把单路 HDMI 转成 NDI，不需要多路监看和互动',
        '重点是公网赛事直播回传，不是手术室到示教室的同步',
        '医疗案例关注手术室多路信号、示教室监看、远程互动和录制。',
      ),
      makeQuestion(
        'ProAV 行业案例',
        '千视用户案例（ProAV 行业）2026_01_23',
        '剧院督导监管项目为什么需要多路分发投屏？',
        '让督导、VIP、化妆间、候场区等区域同步看到关键画面',
        '只用于舞台主扩音频调音，不涉及视频监看',
        '主要为了 P3 远程聚合接收，不需要本地分发',
        '只把节目画面送到单个录机，不需要多区域同步显示',
        '剧院案例强调主画面集中切换并分发至多个业务空间。',
      ),
      makeQuestion(
        'ProAV 行业案例',
        '千视用户案例（ProAV 行业）2026_01_23',
        '体育赛事监看系统通常更看重什么？',
        '低延时、稳定传输、多画面监看和长时间运行',
        '只需要高压缩低码率预览，不需要稳定主链路',
        '重点是会议室统一控制，不涉及赛事信号调度',
        '只做单路推流，避免多画面监看和长期运行要求',
        '全运会、世运会等案例均强调稳定运行、低延时、监看和调度。',
      ),
    ],
  },
];

export const BRAND_IMAGES = {
  logoBlue,
  logoWhite,
  deviceIcon,
};

export const buildQuizFromBanks = (banks: Product[], targetLength = QUIZ_LENGTH): Question[] => {
  if (banks.length === 0) return [];

  const uniqueQuestions = Array.from(
    new Map(banks.flatMap((bank) => bank.questions).map((question) => [`${question.category}:${question.text}`, question])).values(),
  );

  if (uniqueQuestions.length < targetLength) {
    throw new Error(`At least ${targetLength} unique questions are required to generate a quiz.`);
  }

  return shuffle(uniqueQuestions)
    .slice(0, targetLength)
    .map((question) => shuffleQuestionOptions(question));
};

export const getUniqueQuestionCount = (banks: Product[]) =>
  new Set(banks.flatMap((bank) => bank.questions.map((question) => `${question.category}:${question.text}`))).size;

const randomIndex = (maxExclusive: number) => {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] % maxExclusive;
};

const shuffle = <T,>(items: T[]) => {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
};

const shuffleQuestionOptions = (question: Question): Question => {
  const correctOption = question.options[question.correctIndex];
  const options = shuffle(question.options);
  const correctIndex = options.findIndex((option) => option === correctOption);

  return {
    ...question,
    options,
    correctIndex,
  };
};
