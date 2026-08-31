import type { i18n as I18nInstance } from 'i18next'

const en = {
  learning: {
    aboutDescription:
      'Turn online or local video into searchable transcripts, timeline notes, subtitles, and reusable knowledge.',
    aboutFeatures: {
      ai: {
        description:
          'Study notes, glossaries, recall quizzes, and action plans grounded in timestamps.',
        title: 'Learning-oriented AI'
      },
      notes: {
        description:
          'Capture insights, questions, actions, and bookmarks at the exact playback moment.',
        title: 'Timeline notebook'
      },
      transcript: {
        description: 'Prefer source captions, or transcribe locally with an offline speech model.',
        title: 'Local transcription'
      },
      translate: {
        description: 'Read, search, translate, copy, and export timestamped transcripts.',
        title: 'Bilingual study'
      }
    },
    automation: {
      autoRun: 'Run when transcript finishes',
      defaultModel: 'Workflow model override',
      defaultModelHint: 'Leave blank to use the active AI provider and its configured model.',
      defaultModelPlaceholder: 'Optional model name',
      description:
        'Keep frequent work deterministic. Summary and mind map are enabled by default; every system prompt remains editable and versioned.',
      enabled: 'Available',
      loadFailed: 'Could not load learning automation settings',
      promptVersion: 'Prompt version {{version}}',
      resetHint: 'Defaults restored in the editor. Save to apply them.',
      restoreDefaults: 'Restore defaults',
      save: 'Save workflows',
      saveFailed: 'Could not save learning automation settings',
      saved: 'Learning automation settings saved',
      saving: 'Saving…',
      systemPrompt: 'System prompt',
      title: 'Learning AI workflows',
      workflows: {
        mindmap: {
          description: 'Create a Mermaid knowledge map grounded in the transcript.',
          title: 'Mind map'
        },
        'quote-candidates': {
          description: 'Suggest faithful source quotes and clearly marked polished variants.',
          title: 'Quote candidates'
        },
        reflection: {
          description: 'Turn selected passages and personal notes into a first-person reflection.',
          title: 'Reflection draft'
        },
        summary: {
          description: 'Create a detailed, timestamp-grounded structured summary.',
          title: 'Detailed summary'
        },
        translation: {
          description:
            'Translate transcript segments with neighboring context and stable terminology.',
          title: 'Transcript translation'
        }
      }
    },
    addLesson: 'Add a lesson',
    addNote: 'Add note',
    appName: 'Fengsha AI Learning Platform',
    studyChat: {
      answerFailed: 'The AI answer failed. Please try again.',
      assistant: 'AI learning companion',
      configureProvider: 'Configure a default AI model in Settings first',
      copied: 'Answer copied',
      copy: 'Copy this answer',
      emptyDescription:
        'AI answers from the transcript, your notes, and earlier turns, with timestamps linked to the source video.',
      emptyTitle: 'Keep asking about this learning material',
      enterQuestion: 'Enter a question first',
      inputLabel: 'Ask about the current learning project',
      loading: 'Loading conversation',
      memory: 'Recent conversation in this project is remembered',
      persistFailed:
        'The answer is complete but could not be saved. It will remain available in this session.',
      placeholder: 'Ask about this material. Press Ctrl + Enter to send…',
      quick: {
        apply: 'Apply it in practice',
        core: 'Extract key ideas',
        critical: 'Critical analysis',
        difficult: 'Explain tricky points',
        review: 'Create review questions'
      },
      saving: 'Saving this answer…',
      selectedPrompt:
        'Explain this passage in context, including its evidence and practical use:\n{{text}}',
      send: 'Send',
      sendFailed: 'Could not send. Please try again.',
      stop: 'Stop generating',
      transcriptPending: 'The transcript is not ready yet',
      you: 'You'
    },
    mindmapViewer: {
      collapseAll: 'Collapse all',
      collapseNode: 'Collapse {{label}}',
      expandAll: 'Expand all',
      expandNode: 'Expand {{label}}',
      fit: 'Fit to view',
      fullscreen: 'Open mind map fullscreen',
      fullscreenDescription: 'Explore the mind map in a larger draggable and zoomable canvas.',
      hint: 'Select a branch to reveal or hide deeper knowledge.',
      invalid: 'This mind map could not be displayed safely.',
      legacy: 'Interactive view converted from a historical Mermaid flowchart.',
      seek: 'Play evidence at {{time}}',
      title: 'Interactive mind map',
      toggleNode: 'Expand or collapse this branch',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out'
    },
    centerDescription:
      'Keep every lesson, objective, insight, open question, and next action in one place.',
    centerEyebrow: 'PERSONAL KNOWLEDGE WORKSPACE',
    centerTitle: 'Learning Center',
    companion: {
      captureReceived: 'Browser capture received',
      codeCopied: 'Pairing code copied',
      copyCode: 'Copy pairing code',
      description:
        'Send the current YouTube or Bilibili video, timestamp, visible captions, and an optional frame to this computer.',
      loadFailed: 'Could not load browser companion status',
      markerNote: 'Captured from the browser at this exact playback moment.',
      noDevices: 'No browser has been paired yet.',
      pairedDevices: 'Paired browsers',
      pairingCode: 'One-time pairing code',
      pairingHint: 'Open the extension, enter this code once, then explicitly choose what to send.',
      privacyDescription:
        'The bridge only listens on 127.0.0.1. Resetting removes every saved browser token and creates a new code.',
      privacyTitle: 'Local and explicit by design',
      reset: 'Reset pairings',
      resetDone: 'Browser pairings reset',
      resetFailed: 'Could not reset browser pairings',
      running: 'Local port {{port}}',
      starting: 'Starting…',
      title: 'Browser learning companion'
    },
    continue: 'Continue',
    captureFrame: 'Capture frame',
    captureFrameUnavailable: 'A video frame is not available yet',
    sidebar: {
      collapse: 'Hide navigation sidebar',
      expand: 'Show navigation sidebar'
    },
    translation: {
      bilingual: 'Bilingual',
      label: 'Translation',
      readingOnly: 'Translation is available in AI Reading view',
      targetLanguage: 'Target language',
      toggle: 'Show or hide the translated reading view'
    },
    corrections: {
      restoreOriginal: 'Restore original transcript',
      restored: 'Original transcript restored; history retained',
      saved: 'Correction saved without changing the original transcript'
    },
    copied: 'Notebook copied',
    copy: 'Copy notebook',
    currentMoment: 'Current moment',
    delete: 'Delete note',
    emptyLibrary: 'Your learning library is ready',
    emptyLibraryDescription:
      'Paste a YouTube or Bilibili link, or import a local video. A completed transcript becomes a lesson.',
    emptyNotes: 'Capture the first useful idea',
    emptyNotesDescription:
      'Play the video, then save an insight, question, action, or bookmark at the current timestamp.',
    export: 'Export notebook',
    exported: 'Notebook exported',
    featureAi: 'AI study tools',
    featureNotes: 'Timeline notes',
    featureTranscript: 'Live transcript',
    featureTranslate: 'Translation',
    frameCaptured: 'Current frame added to learning outputs',
    imageStudio: {
      aspectRatio: 'Aspect ratio',
      clickToView: 'Open full-size view',
      cropFailed: 'Could not prepare the selected aspect ratio',
      description: 'One clear brief, one useful visual.',
      download: 'Download',
      downloadPng: 'Download PNG',
      elapsed: 'elapsed',
      emptyDescription:
        'Choose a use, style, and ratio, then describe what the image should communicate.',
      emptyTitle: 'Your generated visual appears here',
      exportFailed: 'Could not export image',
      exported: 'Image exported',
      fitWindow: 'Fit',
      generate: 'Generate image',
      generatedAndSaved: 'Image generated and saved',
      generatedImage: 'AI-generated learning visual',
      generatingHint: 'The image task keeps running if you switch tools.',
      openViewer: 'Open generated image viewer',
      optimize: 'Optimize with AI',
      optimizedPrompt: 'Optimized image prompt',
      optimizedReady: 'Optimized prompt ready; expand to review or edit',
      optimizing: 'Optimizing live…',
      partialPreview: 'Improving details',
      promptOptimization: 'AI prompt optimization',
      promptOptimizationHint: 'Optional advanced step; your original brief can generate directly',
      purpose: 'Use',
      purposes: {
        cover: 'Content cover',
        explain: 'Explain knowledge',
        share: 'Social sharing'
      },
      ratioLabel: '{{ratio}} aspect ratio',
      ratioMappingHint: 'Mapped to the closest model size',
      request: 'What should this image communicate?',
      requestPlaceholder:
        'For example: show the three core ideas from this lesson as one calm, easy-to-scan visual…',
      requestRequired: 'Describe what you want the image to communicate first',
      saveFailed: 'Image generated, but could not be saved',
      selectedQuoteRequest:
        'Turn this passage from around {{seconds}} seconds into a restrained, polished social visual. Preserve its meaning: “{{quote}}”',
      stages: {
        completed: 'Image ready',
        generating: 'Building the composition',
        idle: 'Preparing',
        partial: 'Refining the preview',
        requesting: 'Connecting to the image model'
      },
      stop: 'Stop generation',
      style: 'Visual style',
      styles: {
        cinematic: 'Cinematic poster',
        editorial: 'Editorial illustration',
        infographic: 'Clear infographic',
        minimal: 'Quiet minimal'
      },
      title: 'One Visual, Full Meaning',
      viewerDescription: 'Zoom with the mouse wheel or buttons, and drag while zoomed in.',
      viewerTitle: 'Image preview',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out'
    },
    goal: 'Learning goal',
    goalPlaceholder: 'What should you understand or be able to do after this lesson?',
    heroDescription:
      'Paste a YouTube or Bilibili link, or import local media. Transcribe locally, translate, summarize, take timestamped notes, and export subtitles.',
    heroEyebrow: 'LOCAL-FIRST VIDEO LEARNING',
    heroTitle: 'Turn one video into a reusable body of knowledge',
    deleteDialog: {
      cancel: 'Cancel',
      confirm: 'Delete permanently',
      deleteDownloadedMedia: 'Also delete the media file downloaded by this app',
      deleting: 'Deleting…',
      description:
        'Delete “{{title}}” and its transcript, notes, highlights, and AI outputs? This cannot be undone.',
      failed: 'The learning source could not be deleted',
      itemLabel: 'Delete {{title}}',
      localHint: 'The original local audio or video file will be preserved.',
      localPreserved: 'Learning data deleted; the original local file was preserved',
      mediaDeleteFailed:
        'Learning data was deleted, but Windows kept the downloaded media file in use. Close other players and delete that file manually.',
      openMediaLocation: 'Open file location',
      success: 'Learning source deleted',
      title: 'Delete this learning source?'
    },
    home: {
      actions: {
        blank: {
          description: 'Start from a free-form page',
          title: 'Blank note'
        },
        cloud: {
          description: 'Bring in files from your drive',
          title: 'Cloud drive import'
        },
        companion: {
          description: 'Pair Chrome or Edge locally',
          title: 'Browser companion'
        },
        link: {
          description: 'YouTube, Bilibili, and more',
          title: 'Parse a link'
        },
        local: {
          description: 'Video or audio from this computer',
          title: 'Upload local media'
        },
        record: {
          description: 'Capture a lesson or meeting',
          title: 'Upload a recording'
        }
      },
      description:
        'Choose a source and let the transcript, notes, summary, and visual knowledge grow from the same material.',
      eyebrow: 'CREATE A LEARNING SOURCE',
      openLibrary: 'Learning library',
      recentEmpty: 'Imported videos and saved notebooks will appear here.',
      recentEyebrow: 'RECENTLY OPENED',
      recentSavedLocally: 'Saved locally',
      recentTitle: 'Recent learning',
      status: {
        available: 'Ready',
        reserved: 'Reserved',
        soon: 'Coming soon'
      },
      title: 'What would you like to learn from today?',
      viewAll: 'View all'
    },
    inProgress: 'Notes saved',
    kinds: { action: 'Action', bookmark: 'Bookmark', insight: 'Insight', question: 'Question' },
    library: {
      addSource: 'Add source',
      cardView: 'Card view',
      description: '{{count}} local sources with their transcripts, notes, and generated content.',
      emptyAction: 'Add the first source',
      emptyDescription:
        'Upload local media or paste a video link. Your transcript and notes stay together.',
      emptyTitle: 'No learning sources yet',
      eyebrow: 'PERSONAL SOURCE LIBRARY',
      filteredEmpty: 'No sources match the selected status or tag.',
      filters: {
        all: 'All',
        attention: 'Needs attention',
        processing: 'Processing',
        ready: 'Transcript ready',
        saved: 'Saved notes'
      },
      listView: 'List view',
      savedLocally: 'Saved locally',
      status: {
        attention: 'Needs attention',
        processing: 'Transcribing',
        ready: 'Transcript ready',
        saved: 'Saved locally'
      },
      statusLabel: 'Filter by status',
      tagLabel: 'Filter by tag',
      title: 'Learning library',
      tools: 'Library search and display settings',
      viewLabel: 'Choose library view'
    },
    lessons: 'Lessons',
    loading: 'Loading notebook…',
    unknownSpeaker: 'Speaker',
    localFirst: 'LOCAL-FIRST · WINDOWS',
    legacyTranscriptNotes: 'Legacy source notes',
    markDone: 'Mark done',
    noGoal: 'No learning goal yet. Open the lesson and set one.',
    noQuote: 'Play the video to capture the current transcript line.',
    notebook: 'Study notes',
    notebookDescription: 'One focused notebook for your thoughts and timestamped source excerpts.',
    notebookCharacterCount: '{{count}} characters',
    notebookTimestampHint: 'Timestamp links return to the video',
    personalNote: 'My notes',
    personalNoteDescription: 'Free-form Markdown for your own understanding and reflection.',
    personalNoteEmpty: 'Nothing here yet. Switch to Edit to start writing.',
    personalNotePlaceholder: 'Write freely in Markdown…',
    edit: 'Edit',
    preview: 'Preview',
    transcriptNotes: 'Transcript annotations',
    transcriptNotesDescription:
      'Select a passage or use the current line. Every annotation keeps its source and timestamp.',
    transcriptNotePlaceholder: 'Add your note about this passage…',
    addTranscriptNote: 'Save annotation',
    searchTranscriptNotes: 'Search source text or annotations',
    emptyTranscriptNotes: 'Select a useful passage and add your first annotation.',
    noMatchingNotes: 'No matching annotations.',
    followCurrent: 'Use current line',
    highlightColor: 'Highlight',
    highlightColors: {
      amber: 'Amber',
      blue: 'Blue',
      green: 'Green',
      pink: 'Pink',
      purple: 'Purple'
    },
    noteCount: '{{count}} notes',
    outputCount: '{{count}} outputs',
    outputs: 'Learning outputs',
    notePlaceholder: 'Write the idea in your own words…',
    notes: 'Notes',
    openLibrary: 'Open Learning Center',
    openQuestions: 'Open questions',
    openSourceDescription:
      'Built from the open-source VidBee engine under its original license. Attribution and license are retained in this distribution.',
    openSourceTitle: 'Open-source foundation',
    output: {
      addBlock: 'Add manually',
      aiActions: {
        ai: 'Extract key ideas',
        mermaid: 'Generate Mermaid diagram',
        paragraph: 'Generate study document',
        question: 'Generate review questions',
        quote: 'Find a shareable quote',
        reflection: 'Draft a reflection',
        screenshot: 'Write screenshot caption'
      },
      aiFailed: 'AI generation failed: {{message}}',
      aiGenerate: 'Generate with AI',
      aiGenerated: '{{type}} is ready and remains fully editable.',
      aiGenerating: 'AI is generating…',
      aiNoTranscript: 'A transcript is required before AI can generate this content.',
      aiRegenerate: 'Regenerate with AI',
      aiUnknownError: 'Unknown model error',
      blockKinds: {
        ai: 'AI result',
        mermaid: 'Mermaid diagram',
        paragraph: 'Text',
        question: 'Question',
        quote: 'Source quote',
        reflection: 'Reflection',
        screenshot: 'Screenshot'
      },
      blockDeleted: 'Content block deleted',
      deleteBlock: 'Delete block',
      document: 'Document',
      documentTitle: 'Learning document',
      emptyDescription:
        'Let AI draft the document, key ideas, questions, quotes, reflections, and Mermaid diagrams. Manual blocks remain available for your own edits.',
      emptyTitle: 'Start with an AI-generated learning output',
      exportObsidian: 'Write to Obsidian',
      fields: {
        alt: 'Image description',
        caption: 'Caption',
        content: 'Content',
        imageSrc: 'Image path or URL',
        mermaid: 'Mermaid code',
        model: 'Model',
        note: 'Your note',
        prompt: 'Prompt',
        quote: 'Original quote',
        resolved: 'Resolved',
        sourceUrl: 'Source URL',
        timestamp: 'Timestamp (seconds)',
        title: 'Title'
      },
      markdownPreview: 'Standard Markdown',
      mermaidPreview: 'Diagram preview',
      mermaidSource: 'Manually edit Mermaid source',
      moveDown: 'Move down',
      moveUp: 'Move up',
      obsidianConflict: 'The Obsidian note has manual changes. Review it or choose overwrite.',
      obsidianFailed: 'Could not write to Obsidian',
      obsidianWritten: 'Written to {{path}}',
      overwriteObsidian: 'Overwrite managed note',
      quote: {
        aspect: 'Size',
        aspects: { portrait: '3:4', square: '1:1', story: '9:16' },
        brand: 'Quote card studio',
        export: 'Export PNG',
        exportFailed: 'Could not render the quote card',
        exported: 'Quote card exported',
        exporting: 'Rendering…',
        fontScale: 'Type size',
        fontScales: { balanced: 'Balanced', compact: 'Compact', large: 'Large' },
        preview: 'LIVE PREVIEW',
        showBrand: 'Show brand',
        showSource: 'Show source',
        signature: 'Signature',
        sourceAuthor: 'Author',
        sourceTitle: 'Video title',
        template: 'Template',
        templates: {
          quote: 'Editorial quote',
          'quote-reflection': 'Quote + reflection',
          'visual-quote': 'Video frame'
        },
        theme: 'Theme',
        themes: { forest: 'Forest', ink: 'Ink', paper: 'Paper' }
      },
      quoteCard: 'Quote card',
      source: 'Source',
      undoDelete: 'Undo'
    },
    privacyDescription:
      'Transcription and notebooks stay on this computer by default. Analytics and upstream automatic updates are disabled.',
    privacyTitle: 'Local-first privacy',
    loadFailed:
      'Could not load the saved learning workspace. Editing stays locked to protect existing data.',
    noteDeleted: 'Note deleted',
    reopen: 'Reopen',
    retryLoad: 'Retry loading',
    undo: 'Undo',
    saved: 'Saved locally',
    saveFailed: 'Could not save the notebook',
    saving: 'Saving…',
    search: {
      count: '{{count}} matches',
      empty: 'No matching transcript, note, translation, or AI result.',
      fields: {
        ai: 'AI',
        note: 'Note',
        title: 'Title',
        transcript: 'Transcript',
        translation: 'Translation'
      },
      label: 'Search the learning library',
      placeholder: 'Search every transcript, note, translation, and AI result…',
      searching: 'Searching…',
      title: 'Search results'
    },
    selection: {
      addedToNotes: 'Source passage added to notes',
      aiFailed: 'Could not start AI on the selection',
      aiStarted: 'AI is working on the selected passage',
      askAi: 'Ask AI',
      capturedNote: 'Source passage captured — add your understanding here.',
      configureAi: 'Configure and enable an AI provider first.',
      copy: 'Copy',
      highlight: 'Highlight',
      highlighted: 'Passage highlighted',
      noPrompt: 'Enable at least one AI prompt first.',
      note: 'Add note',
      quoteCard: 'Quote card',
      reflection: 'Reflection',
      reflectionPrompt: 'What did this passage change, clarify, or make actionable for me?',
      seek: 'Play from here'
    },
    startFirst: 'Create the first lesson',
    studio: {
      descriptions: {
        note: 'Keep the video and source transcript visible while writing in your own words.',
        output: 'Turn selected evidence and notes into a reusable document or shareable card.',
        watch: 'Follow the video with a searchable, clickable transcript.'
      },
      layout: {
        collapseNote: 'Hide notes',
        collapseOutput: 'Hide AI workspace',
        expandNote: 'Show notes',
        expandOutput: 'Show AI workspace',
        resizeNote: 'Resize notes',
        resizeOutput: 'Resize AI workspace'
      },
      regions: { note: 'Notes', output: 'Output', transcript: 'Transcript', video: 'Video' },
      scenes: { note: 'Note', output: 'Output', watch: 'Watch' }
    },
    untitled: 'Untitled lesson'
  },
  menu: { learning: 'Learning' },
  settings: {
    companionTab: 'Browser companion',
    learningAutomationTab: 'Learning automation',
    ai: {
      providerCards: {
        add: 'Add',
        addTextDescription: 'Add a provider to generate study content',
        authentication: 'Authentication',
        cancel: 'Cancel',
        configureImage: 'Configure image model',
        edit: 'Edit',
        imageDescription:
          'Image generation is configured independently. The API key is sealed locally, and saving does not make a paid request.',
        imageModel: 'Image model',
        inUse: 'In use',
        keepSavedKey: 'Leave blank to keep saved key',
        keyHeader: 'API key header',
        localNoAuth: 'None (local only)',
        model: 'Model',
        notConfigured: 'Not configured',
        openAiCompatible: 'OpenAI-compatible',
        saveImage: 'Save image model',
        savedImage: 'Image model saved securely',
        service: 'Service',
        setupRequired: 'Setup required',
        textModel: 'Text model'
      },
      presetPrompts: {
        'active-recall': { title: 'Active Recall Quiz' },
        'concept-glossary': { title: 'Concept Glossary' },
        'image-prompt-optimizer': { title: 'Optimize Image Prompt' },
        'learning-action-plan': { title: 'Learning Action Plan' },
        'learning-diagram': { title: 'Generate Mind Map' },
        'learning-digest': { title: 'Learning Digest' },
        'learning-outline': { title: 'Learning Outline' },
        'learning-podcast-script': { title: 'Learning Podcast' },
        'learning-question': { title: 'Ask This Lesson' },
        'learning-template-summary': { title: 'Template Summary' },
        'study-notes': { title: 'Structured Study Notes' }
      }
    }
  },
  transcript: { export: { format: { srt: '.srt', vtt: '.vtt' } } }
}

const zh = {
  learning: {
    aboutDescription: '把在线或本地视频变成可搜索逐字稿、时间点笔记、字幕文件和可复用知识。',
    aboutFeatures: {
      ai: {
        description: '生成带时间依据的学习笔记、概念表、主动回忆题和行动计划。',
        title: '学习型 AI'
      },
      notes: {
        description: '在准确播放时间记录知识点、疑问、行动项和书签，点击即可回看。',
        title: '时间轴笔记'
      },
      transcript: {
        description: '优先读取平台字幕；没有字幕时，使用本地离线语音模型转录。',
        title: '本地转录'
      },
      translate: {
        description: '查看、搜索、翻译、复制并导出带时间线的逐字稿。',
        title: '双语学习'
      }
    },
    automation: {
      autoRun: '逐字稿完成后自动运行',
      defaultModel: '工作流指定模型',
      defaultModelHint: '留空时使用当前启用的 AI 服务商及其模型。',
      defaultModelPlaceholder: '可选：填写模型名称',
      description:
        '把高频工作固定下来。默认自动总结和思维导图，其余按需调用；每套系统提示词都能修改并保留版本。',
      enabled: '允许使用',
      loadFailed: '无法读取学习自动化设置',
      promptVersion: '提示词版本 {{version}}',
      resetHint: '默认值已放回编辑器，点击保存后生效。',
      restoreDefaults: '恢复优质默认值',
      save: '保存工作流',
      saveFailed: '学习自动化设置保存失败',
      saved: '学习自动化设置已保存',
      saving: '正在保存…',
      systemPrompt: '系统提示词',
      title: '学习 AI 工作流',
      workflows: {
        mindmap: {
          description: '根据逐字稿生成可渲染的 Mermaid 知识结构图。',
          title: '思维导图'
        },
        'quote-candidates': {
          description: '推荐忠于原文的金句，并把润色版本明确区分出来。',
          title: '金句候选'
        },
        reflection: {
          description: '把选中原文和个人笔记整理成第一人称学习心得。',
          title: '心得草稿'
        },
        summary: {
          description: '生成详细、结构化并且带来源时间点的视频总结。',
          title: '详细总结'
        },
        translation: {
          description: '结合上下文翻译字幕，保持人物、产品和术语一致。',
          title: '逐字稿翻译'
        }
      }
    },
    addLesson: '添加学习视频',
    addNote: '添加笔记',
    appName: '风沙AI学习平台',
    studyChat: {
      answerFailed: 'AI 回答失败，请重试',
      assistant: 'AI 学习助手',
      configureProvider: '请先在设置中配置默认 AI 模型',
      copied: '已复制回答',
      copy: '复制本次回答',
      emptyDescription: 'AI 会结合逐字稿、你的笔记和此前对话回答，并用时间标记链接回原视频。',
      emptyTitle: '围绕这份资料继续追问',
      enterQuestion: '请输入你想了解的问题',
      inputLabel: '向当前学习项目提问',
      loading: '正在读取对话',
      memory: '已记住本项目最近的对话',
      persistFailed: 'AI 回答已完成但未能保存；本次使用期间仍会保留这轮上下文。',
      placeholder: '针对这份资料提问，Ctrl + Enter 发送……',
      quick: {
        apply: '如何实际应用',
        core: '提炼核心观点',
        critical: '批判性分析',
        difficult: '解释易错难点',
        review: '生成复习问题'
      },
      saving: '正在保存本轮回答…',
      selectedPrompt: '请结合上下文解释这段内容，并说明它的依据与应用：\n{{text}}',
      send: '发送',
      sendFailed: '没有成功发送，请稍后重试',
      stop: '停止生成',
      transcriptPending: '逐字稿尚未就绪',
      you: '我'
    },
    mindmapViewer: {
      collapseAll: '全部收起',
      collapseNode: '收起“{{label}}”',
      expandAll: '全部展开',
      expandNode: '展开“{{label}}”',
      fit: '适应视图',
      fullscreen: '全屏查看思维导图',
      fullscreenDescription: '在更大的画布中拖动、缩放并展开思维导图。',
      hint: '点击分支节点可展开或收起更深层知识。',
      invalid: '这份思维导图无法安全显示。',
      legacy: '已将历史 Mermaid 流程图转换为可交互思维导图。',
      seek: '跳到 {{time}} 播放证据',
      title: '交互式思维导图',
      toggleNode: '展开或收起这个分支',
      zoomIn: '放大',
      zoomOut: '缩小'
    },
    centerDescription: '集中管理每一节视频、学习目标、知识点、待解问题和下一步行动。',
    centerEyebrow: '个人知识工作台',
    centerTitle: '学习中心',
    companion: {
      captureReceived: '已收到浏览器采集内容',
      codeCopied: '配对码已复制',
      copyCode: '复制配对码',
      description: '把当前 YouTube 或 B 站视频、播放时间、可见字幕和可选画面发送到本机学习台。',
      loadFailed: '无法读取浏览器助手状态',
      markerNote: '已从浏览器记录这个准确播放时刻。',
      noDevices: '尚未配对任何浏览器。',
      pairedDevices: '已配对浏览器',
      pairingCode: '一次性配对码',
      pairingHint: '打开扩展并输入一次；以后仍需由你明确点击，才会发送当前内容。',
      privacyDescription: '桥接服务只监听 127.0.0.1；重置后会移除全部浏览器令牌并生成新配对码。',
      privacyTitle: '只在本机，且由你主动触发',
      reset: '重置配对',
      resetDone: '浏览器配对已重置',
      resetFailed: '重置浏览器配对失败',
      running: '本机端口 {{port}}',
      starting: '正在启动…',
      title: '浏览器学习助手'
    },
    continue: '继续学习',
    captureFrame: '截取当前画面',
    captureFrameUnavailable: '当前没有可截取的视频画面',
    sidebar: {
      collapse: '隐藏导航栏',
      expand: '显示导航栏'
    },
    translation: {
      bilingual: '双语',
      label: '译文',
      readingOnly: '译文仅在 AI 阅读版中可用',
      targetLanguage: '目标语言',
      toggle: '显示或隐藏译文'
    },
    corrections: {
      restoreOriginal: '恢复原始逐字稿',
      restored: '已恢复原文，历史版本仍保留',
      saved: '校对已保存，原始逐字稿未被覆盖'
    },
    copied: '学习笔记已复制',
    copy: '复制学习笔记',
    currentMoment: '当前播放位置',
    delete: '删除笔记',
    emptyLibrary: '你的学习资料库已经准备好',
    emptyLibraryDescription:
      '粘贴 YouTube 或 B 站链接，也可以导入本地视频；完成转录后，它就会成为一节可反复学习的课程。',
    emptyNotes: '记下第一个真正有用的知识点',
    emptyNotesDescription: '播放视频，在当前时间点记录知识点、疑问、行动项或书签。',
    export: '导出学习笔记',
    exported: '学习笔记已导出',
    featureAi: 'AI 学习助手',
    featureNotes: '时间点笔记',
    featureTranscript: '实时逐字稿',
    featureTranslate: '字幕翻译',
    frameCaptured: '当前画面已加入学习成果',
    imageStudio: {
      aspectRatio: '画面比例',
      clickToView: '点击放大查看',
      cropFailed: '无法按所选比例处理图片',
      description: '一个需求，一张真正有用的图。',
      download: '下载',
      downloadPng: '下载 PNG',
      elapsed: '已等待',
      emptyDescription: '选择用途、风格和比例，再描述这张图需要传达什么。',
      emptyTitle: '生成结果将在这里呈现',
      exportFailed: '图片导出失败',
      exported: '图片已导出',
      fitWindow: '适应窗口',
      generate: '生成图片',
      generatedAndSaved: '图片已生成并保存',
      generatedImage: 'AI 生成的学习图片',
      generatingHint: '切换到其他功能也不会中断本次任务。',
      openViewer: '打开生成图片查看器',
      optimize: 'AI 优化提示词',
      optimizedPrompt: '优化后的生图提示词',
      optimizedReady: '提示词已优化，可展开查看或继续修改',
      optimizing: '正在流式优化…',
      partialPreview: '仍在完善细节',
      promptOptimization: 'AI 提示词优化',
      promptOptimizationHint: '可选高级步骤；不优化也能直接生成',
      purpose: '使用场景',
      purposes: {
        cover: '内容封面',
        explain: '知识梳理',
        share: '社交分享'
      },
      ratioLabel: '{{ratio}} 画面比例',
      ratioMappingHint: '自动适配模型最接近尺寸',
      request: '这张图需要表达什么？',
      requestPlaceholder: '例如：把本节课的三个核心观点做成一张克制、清晰、容易扫读的知识图……',
      requestRequired: '请先描述这张图需要表达什么',
      saveFailed: '图片已生成，但保存失败',
      selectedQuoteRequest:
        '把 {{seconds}} 秒附近的这段内容做成一张克制、高级、适合分享的图片，准确保留原意：“{{quote}}”',
      stages: {
        completed: '图片已完成',
        generating: '正在构建画面',
        idle: '正在准备',
        partial: '正在完善预览',
        requesting: '正在连接图片模型'
      },
      stop: '停止生成',
      style: '视觉风格',
      styles: {
        cinematic: '电影感海报',
        editorial: '编辑插画',
        infographic: '清晰信息图',
        minimal: '极简高级'
      },
      title: '一图胜千言',
      viewerDescription: '使用鼠标滚轮或按钮缩放，放大后可拖动画面查看细节。',
      viewerTitle: '图片预览',
      zoomIn: '放大',
      zoomOut: '缩小'
    },
    goal: '学习目标',
    goalPlaceholder: '学完后，你希望理解什么，或者能够做到什么？',
    heroDescription:
      '粘贴 YouTube、B 站链接或导入本地视频。本地转录、翻译总结、时间点笔记、字幕导出，一处完成。',
    heroEyebrow: '本地优先的视频学习工作台',
    heroTitle: '把一段视频，变成一套真正能复用的知识',
    deleteDialog: {
      cancel: '取消',
      confirm: '永久删除',
      deleteDownloadedMedia: '同时删除由本软件通过链接下载的音视频文件',
      deleting: '正在删除…',
      description: '确定删除“{{title}}”吗？逐字稿、笔记、高亮和 AI 生成内容都会删除，且无法撤销。',
      failed: '删除学习资料失败',
      itemLabel: '删除 {{title}}',
      localHint: '这是本地导入的资料，只删除学习数据，不会删除你的原始音视频文件。',
      localPreserved: '学习数据已删除，原始本地文件已保留',
      mediaDeleteFailed:
        '学习数据已删除，但 Windows 仍占用着下载的音视频文件。请关闭其他播放器后手动删除该文件。',
      openMediaLocation: '打开文件所在位置',
      success: '学习资料已删除',
      title: '删除这份学习资料？'
    },
    home: {
      actions: {
        blank: { description: '从一张自由页面开始', title: '空白笔记' },
        cloud: { description: '从个人网盘带入文件', title: '网盘导入' },
        companion: { description: '在本机配对 Chrome 或 Edge', title: '浏览器助手' },
        link: { description: 'YouTube、B 站等视频网址', title: '链接解析' },
        local: { description: '选择电脑中的视频或音频', title: '本地上传' },
        record: { description: '导入课程或会议录制文件', title: '录制上传' }
      },
      description: '选择一个来源，让逐字稿、笔记、总结和视觉知识围绕同一份资料生长。',
      eyebrow: '创建学习资料',
      openLibrary: '学习资料库',
      recentEmpty: '导入视频或保存笔记后，它们会出现在这里。',
      recentEyebrow: '最近打开',
      recentSavedLocally: '已存本机',
      recentTitle: '最近学习',
      status: { available: '可使用', reserved: '能力预留', soon: '即将接入' },
      title: '今天想从什么开始学？',
      viewAll: '查看全部'
    },
    inProgress: '已有记录',
    kinds: { action: '行动项', bookmark: '书签', insight: '知识点', question: '待解问题' },
    library: {
      addSource: '添加资料',
      cardView: '卡片视图',
      description: '共 {{count}} 份本地学习资料，逐字稿、笔记和生成内容始终放在一起。',
      emptyAction: '添加第一份资料',
      emptyDescription: '上传本地视频或粘贴视频链接，逐字稿和笔记会一起保留。',
      emptyTitle: '还没有学习资料',
      eyebrow: '个人学习资料库',
      filteredEmpty: '当前状态或标签下没有匹配的资料。',
      filters: {
        all: '全部',
        attention: '需要处理',
        processing: '处理中',
        ready: '逐字稿就绪',
        saved: '已存笔记'
      },
      listView: '列表视图',
      savedLocally: '已存本机',
      status: {
        attention: '需要处理',
        processing: '正在转录',
        ready: '逐字稿就绪',
        saved: '已存本机'
      },
      statusLabel: '按状态筛选',
      tagLabel: '按标签筛选',
      title: '学习资料库',
      tools: '资料库搜索与显示设置',
      viewLabel: '选择资料库视图'
    },
    lessons: '学习视频',
    loading: '正在加载学习笔记…',
    unknownSpeaker: '讲者',
    localFirst: '本地优先 · WINDOWS',
    legacyTranscriptNotes: '旧版原文备注',
    markDone: '标记完成',
    noGoal: '尚未设置学习目标，打开课程即可补充。',
    noQuote: '播放视频后，这里会显示当前字幕内容。',
    notebook: '学习笔记',
    notebookDescription: '一个笔记本集中记录心得与带时间链接的原文摘录。',
    notebookCharacterCount: '{{count}} 字',
    notebookTimestampHint: '点击时间链接可回到视频',
    personalNote: '我的笔记',
    personalNoteDescription: '用 Markdown 自由记录你的理解、联想和心得。',
    personalNoteEmpty: '还没有内容，切换到编辑即可开始记录。',
    personalNotePlaceholder: '支持 Markdown，在这里自由记录……',
    edit: '编辑',
    preview: '预览',
    transcriptNotes: '原文备注',
    transcriptNotesDescription: '选中原文或使用当前句，备注会保留原文和时间位置。',
    transcriptNotePlaceholder: '写下你对这段原文的备注……',
    addTranscriptNote: '保存原文备注',
    searchTranscriptNotes: '搜索原文或备注',
    emptyTranscriptNotes: '选中一段有用的原文，开始第一条备注。',
    noMatchingNotes: '没有找到匹配的原文备注。',
    followCurrent: '使用当前句',
    highlightColor: '高亮颜色',
    highlightColors: {
      amber: '琥珀黄',
      blue: '天空蓝',
      green: '青绿',
      pink: '樱桃粉',
      purple: '葡萄紫'
    },
    noteCount: '{{count}} 条笔记',
    outputCount: '{{count}} 项成果',
    outputs: '学习成果',
    notePlaceholder: '用自己的话写下这个知识点……',
    notes: '笔记总数',
    openLibrary: '打开学习中心',
    openQuestions: '待解问题',
    openSourceDescription: '本软件基于 VidBee 开源引擎改造，并保留原项目署名与许可证。',
    openSourceTitle: '开源基础',
    output: {
      addBlock: '手动添加',
      aiActions: {
        ai: 'AI 提炼重点',
        mermaid: 'AI 生成 Mermaid 图解',
        paragraph: 'AI 生成学习文稿',
        question: 'AI 生成复习问题',
        quote: 'AI 发现可分享金句',
        reflection: 'AI 起草学习心得',
        screenshot: 'AI 补写截图说明'
      },
      aiFailed: 'AI 生成失败：{{message}}',
      aiGenerate: '让 AI 生成',
      aiGenerated: '{{type}}已生成，所有内容仍可手动修改。',
      aiGenerating: 'AI 正在生成…',
      aiNoTranscript: '需要先有逐字稿，AI 才能生成这项内容。',
      aiRegenerate: 'AI 重新生成',
      aiUnknownError: '未知模型错误',
      blockKinds: {
        ai: 'AI 结果',
        mermaid: 'Mermaid 图',
        paragraph: '正文',
        question: '待解问题',
        quote: '原文引用',
        reflection: '学习心得',
        screenshot: '视频截图'
      },
      blockDeleted: '内容块已删除',
      deleteBlock: '删除内容块',
      document: '学习文稿',
      documentTitle: '可视化学习文稿',
      emptyDescription:
        '学习文稿、重点、问题、金句、心得和 Mermaid 图解都可以交给 AI 起草；手动内容块只用于你的修改与补充。',
      emptyTitle: '先让 AI 生成一份可编辑的学习成果',
      exportObsidian: '写入 Obsidian',
      fields: {
        alt: '图片说明',
        caption: '图片注释',
        content: '内容',
        imageSrc: '图片路径或网址',
        mermaid: 'Mermaid 代码',
        model: '模型',
        note: '我的补充',
        prompt: '提示词',
        quote: '原文内容',
        resolved: '已经解决',
        sourceUrl: '来源链接',
        timestamp: '时间点（秒）',
        title: '标题'
      },
      markdownPreview: '标准 Markdown',
      mermaidPreview: '图解预览',
      mermaidSource: '手动调整 Mermaid 源码',
      moveDown: '向下移动',
      moveUp: '向上移动',
      obsidianConflict: 'Obsidian 笔记存在人工修改，请先检查或选择覆盖受管笔记。',
      obsidianFailed: '写入 Obsidian 失败',
      obsidianWritten: '已写入 {{path}}',
      overwriteObsidian: '覆盖受管笔记',
      quote: {
        aspect: '卡片尺寸',
        aspects: { portrait: '3:4 朋友圈', square: '1:1 方图', story: '9:16 竖屏' },
        brand: '金句卡片工作室',
        export: '导出高清 PNG',
        exportFailed: '金句卡片渲染失败',
        exported: '金句卡片已导出',
        exporting: '正在渲染…',
        fontScale: '文字大小',
        fontScales: { balanced: '均衡', compact: '紧凑', large: '醒目' },
        preview: '实时预览',
        showBrand: '显示品牌',
        showSource: '显示来源',
        signature: '署名',
        sourceAuthor: '讲者/作者',
        sourceTitle: '视频标题',
        template: '模板',
        templates: {
          quote: '编辑部金句',
          'quote-reflection': '金句与心得',
          'visual-quote': '视频画面'
        },
        theme: '主题',
        themes: { forest: '森林', ink: '黑金', paper: '纸张' }
      },
      quoteCard: '金句卡片',
      source: '来源',
      undoDelete: '撤销'
    },
    privacyDescription: '转录与学习笔记默认只保存在这台电脑上；数据统计和上游自动更新均已关闭。',
    privacyTitle: '本地优先的隐私设计',
    loadFailed: '无法读取已保存的学习资料。为保护现有数据，编辑功能已暂时锁定。',
    noteDeleted: '学习笔记已删除',
    reopen: '重新打开',
    retryLoad: '重新读取',
    undo: '撤销',
    saved: '已保存到本机',
    saveFailed: '学习笔记保存失败',
    saving: '正在保存…',
    search: {
      count: '{{count}} 条结果',
      empty: '没有找到匹配的逐字稿、笔记、译文或 AI 结果。',
      fields: {
        ai: 'AI 结果',
        note: '笔记',
        title: '标题',
        transcript: '逐字稿',
        translation: '译文'
      },
      label: '搜索学习资料库',
      placeholder: '搜索全部视频标题、逐字稿、笔记、译文和 AI 结果……',
      searching: '正在搜索…',
      title: '搜索结果'
    },
    selection: {
      addedToNotes: '原文已加入学习笔记',
      aiFailed: '无法针对选中内容启动 AI',
      aiStarted: 'AI 正在处理选中的原文',
      askAi: '问 AI',
      capturedNote: '已摘录这段原文，请补充你自己的理解。',
      configureAi: '请先在设置中配置并启用一个 AI 服务商。',
      copy: '复制',
      highlight: '高亮',
      highlighted: '原文已高亮',
      noPrompt: '请先启用至少一套 AI 提示词。',
      note: '加入笔记',
      quoteCard: '金句卡片',
      reflection: '写心得',
      reflectionPrompt: '这段内容改变、澄清了什么？我准备如何应用？',
      seek: '从这里播放'
    },
    startFirst: '创建第一节课程',
    studio: {
      descriptions: {
        note: '视频和原始逐字稿保持可见，同时用自己的话记录理解。',
        output: '把有依据的原文和个人笔记整理成可复用文稿或可分享卡片。',
        watch: '边看视频，边用可搜索、可点击的逐字稿准确回看。'
      },
      layout: {
        collapseNote: '隐藏学习笔记',
        collapseOutput: '隐藏 AI 工作区',
        expandNote: '展开学习笔记',
        expandOutput: '展开 AI 工作区',
        resizeNote: '调整学习笔记宽度',
        resizeOutput: '调整 AI 工作区宽度'
      },
      regions: { note: '学习笔记', output: '输出成果', transcript: '逐字稿', video: '视频' },
      scenes: { note: '做笔记', output: '做输出', watch: '看视频' }
    },
    untitled: '未命名课程'
  },
  menu: { learning: '学习中心' },
  settings: {
    companionTab: '浏览器助手',
    learningAutomationTab: '学习自动化',
    ai: {
      providerCards: {
        add: '添加',
        addTextDescription: '添加一个服务商后即可开始生成学习内容',
        authentication: '鉴权方式',
        cancel: '取消',
        configureImage: '配置图片模型',
        edit: '编辑',
        imageDescription:
          '图片模型与文字模型独立调用。密钥加密保存在本机，保存配置不会发起付费生图。',
        imageModel: '图片模型',
        inUse: '使用中',
        keepSavedKey: '留空则保留原密钥',
        keyHeader: '密钥请求头',
        localNoAuth: '无鉴权（仅本地接口）',
        model: '模型名称',
        notConfigured: '尚未配置',
        openAiCompatible: 'OpenAI 兼容接口',
        saveImage: '保存图片模型',
        savedImage: '图片模型配置已安全保存',
        service: '服务类型',
        setupRequired: '待配置',
        textModel: '文字模型'
      },
      presetPrompts: {
        'active-recall': { title: '主动回忆测验' },
        'concept-glossary': { title: '概念词典' },
        'image-prompt-optimizer': { title: '优化生图提示词' },
        'learning-action-plan': { title: '学习行动计划' },
        'learning-diagram': { title: '生成思维导图' },
        'learning-digest': { title: '精华速览' },
        'learning-outline': { title: '文字大纲' },
        'learning-podcast-script': { title: 'AI 学习播客' },
        'learning-question': { title: '向本节内容提问' },
        'learning-template-summary': { title: '模板总结' },
        'study-notes': { title: '结构化学习笔记' }
      }
    }
  },
  transcript: { export: { format: { srt: '.srt', vtt: '.vtt' } } }
}

const LANGUAGE_CODES = [
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'id',
  'it',
  'ja',
  'ko',
  'pt',
  'ru',
  'tr',
  'zh',
  'zh-TW'
]

export const installProductTranslations = (instance: I18nInstance): void => {
  for (const code of LANGUAGE_CODES) {
    instance.addResourceBundle(code, 'translation', code.startsWith('zh') ? zh : en, true, true)
  }
}
