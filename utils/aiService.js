const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load environment variables
require("dotenv").config();

// Initialize Gemini AI
let genAI;
let model;

try {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn(
      "⚠️ GEMINI_API_KEY is missing. AI features will throw errors until it is set."
    );
  } else {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    console.log(
      "✅ Google Gemini AI initialized with provided GEMINI_API_KEY."
    );
  }
} catch (error) {
  console.error("❌ Gemini AI initialization error:", error.message);
}

/**
 * Generate writing prompts for mental health journaling
 * @param {string} mood - Current user mood
 * @param {string} topic - Optional topic (gratitude, reflection, etc.)
 * @param {boolean} isPremium - Whether user has premium
 * @returns {Promise<Array>} Array of writing suggestions
 */
const generateWritingPrompts = async (
  mood = "",
  topic = "",
  isPremium = false,
  content = ""
) => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    // Detect user language preference from content or default to Vietnamese
    const userLanguage = detectUserLanguage(content);

    // Construct AI prompt
    const aiPrompt = `Generate ${
      isPremium ? "10" : "3"
    } thoughtful, gentle writing prompts for mental health journaling.
    
Context:
- User's current mood: ${mood || "not specified"}
- Topic focus: ${topic || "general reflection"}
- Tone: Supportive, non-judgmental, encouraging
- Language: ${userLanguage === "vi" ? "Vietnamese (Tiếng Việt)" : "English"}
- Target: Personal emotional processing and self-reflection

${
  userLanguage === "vi"
    ? `IMPORTANT: The user wrote in Vietnamese, so please respond in Vietnamese (Tiếng Việt). All prompts should be in Vietnamese.`
    : `IMPORTANT: The user wrote in English, so please respond in English. All prompts should be in English.`
}

Requirements:
- Each prompt should be 1-2 sentences
- Focus on emotional well-being and self-discovery
- Avoid triggering or negative language
- Encourage positive introspection
- Be specific and actionable
- ${
      userLanguage === "vi"
        ? "Use Vietnamese language naturally and culturally appropriate"
        : "Use English language naturally"
    }

Return as a JSON array of strings: ["prompt1", "prompt2", ...]`;

    const result = await model.generateContent(aiPrompt);
    const response = await result.response;
    const text = response.text();

    // Try to parse JSON response
    try {
      const suggestions = JSON.parse(text);
      if (Array.isArray(suggestions)) {
        const aiResult = suggestions.slice(0, isPremium ? 10 : 3);
        console.log(
          `🤖 AI returned ${aiResult.length} suggestions for ${
            isPremium ? "premium" : "free"
          } user`
        );
        return aiResult;
      }
    } catch (parseError) {
      console.warn("⚠️ AI response not valid JSON, parsing manually");
    }

    // Manual parse as a minimal fallback for non-JSON AI responses
    const lines = text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.replace(/^[\d\-\*\.\s]+/, "").trim())
      .filter((line) => line.length > 10);

    const manualResult = lines.slice(0, isPremium ? 10 : 3);
    console.log(
      `📝 Manual parsing returned ${manualResult.length} suggestions for ${
        isPremium ? "premium" : "free"
      } user`
    );
    return manualResult;
  } catch (error) {
    console.error("❌ Error generating AI prompts:", error.message);
    throw error; // Re-throw to let caller handle
  }
};

/**
 * Generate advanced writing prompts for premium users with specific topics
 * @param {string} topic - Specific topic (Gratitude, Forgiveness, Goals, etc.)
 * @param {string} mood - Current user mood
 * @returns {Promise<Array>} Array of 10 advanced writing prompts
 */
const generateAdvancedPrompts = async (
  topic = "reflection",
  mood = "",
  content = ""
) => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    // Detect user language preference from content
    const userLanguage = detectUserLanguage(content);

    // Construct advanced AI prompt
    const aiPrompt = `Generate 10 sophisticated, in-depth writing prompts for mental health journaling focused on the topic: "${topic}".

Context:
- User's current mood: ${mood || "not specified"}
- Topic focus: ${topic}
- Tone: Thoughtful, introspective, encouraging deep reflection
- Language: ${userLanguage === "vi" ? "Vietnamese (Tiếng Việt)" : "English"}
- Target: Advanced emotional processing and personal growth

${
  userLanguage === "vi"
    ? `IMPORTANT: The user wrote in Vietnamese, so please respond in Vietnamese (Tiếng Việt). All prompts should be in Vietnamese.`
    : `IMPORTANT: The user wrote in English, so please respond in English. All prompts should be in English.`
}

Requirements:
- Each prompt should be 1-2 sentences
- Focus on deep self-reflection and personal growth
- Encourage vulnerability and honest self-examination
- Be specific to the topic while remaining universal
- Avoid clichés and surface-level questions
- Encourage meaningful insights and discoveries
- ${
      userLanguage === "vi"
        ? "Use Vietnamese language naturally and culturally appropriate"
        : "Use English language naturally"
    }

Return as a JSON array of strings: ["prompt1", "prompt2", ...]`;

    const result = await model.generateContent(aiPrompt);
    const response = await result.response;
    const text = response.text();

    // Try to parse JSON response
    try {
      const suggestions = JSON.parse(text);
      if (Array.isArray(suggestions)) {
        console.log(
          `🤖 AI returned ${suggestions.length} advanced suggestions for topic: ${topic}`
        );
        return suggestions.slice(0, 10);
      }
    } catch (parseError) {
      // Minimal manual parse when JSON is not returned
      const lines = text
        .split("\n")
        .map((l) => l.replace(/^[\d\-\*\.\s]+/, "").trim())
        .filter((l) => l.length > 5);
      return lines.slice(0, 10);
    }
  } catch (error) {
    console.error("❌ Error generating advanced prompts:", error.message);
    throw error; // Re-throw to let caller handle
  }
};

/**
 * Generate mood-based reflection questions
 * @param {string} moodType - Type of mood (happy, sad, anxious, etc.)
 * @returns {Promise<Array>} Array of mood-specific questions
 */
const generateMoodReflections = async (moodType, content = "") => {
  if (!model) {
    throw new Error("AI model not available - GEMINI_API_KEY required");
  }

  const userLanguage = detectUserLanguage(content);
  const prompt = `Generate 3 brief mood-reflection questions for the mood: ${moodType}. 
Language: ${userLanguage === "vi" ? "Vietnamese (Tiếng Việt)" : "English"}

${
  userLanguage === "vi"
    ? `IMPORTANT: The user wrote in Vietnamese, so please respond in Vietnamese (Tiếng Việt). All questions should be in Vietnamese.`
    : `IMPORTANT: The user wrote in English, so please respond in English. All questions should be in English.`
}

Return JSON array of strings.`;
  const result = await model.generateContent(prompt);
  const text = (await result.response).text();
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr.slice(0, 3);
  } catch {}
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[\d\-\*\.\s]+/, "").trim())
    .filter((l) => l);
  return lines.slice(0, 3);
};

/**
 * Advanced AI sentiment analysis for premium users
 * Detects depression, anxiety, and mental health indicators
 * @param {string} content - Journal content to analyze
 * @returns {Promise<Object>} Detailed sentiment analysis
 */
const analyzeSentiment = async (content) => {
  try {
    if (!model || !content) {
      throw new Error("AI model/content missing");
    }

    // Detect language from content
    const userLanguage = detectUserLanguage(content);
    const isVietnamese = userLanguage === "vi";

    const analysisPrompt = `Analyze this journal entry for mental health indicators and sentiment:

"${content}"

${
  isVietnamese
    ? `IMPORTANT: The user wrote in Vietnamese, so please respond in Vietnamese (Tiếng Việt). All analysis results and recommendations should be in Vietnamese.`
    : `IMPORTANT: The user wrote in English, so please respond in English. All analysis results and recommendations should be in English.`
}

Provide a detailed psychological analysis including:
1. Overall sentiment (positive/negative/neutral with 0-1 score)
2. Mental health indicators (signs of depression, anxiety, stress)
3. Risk assessment (low/medium/high)
4. Key emotional keywords found
5. Supportive recommendations (2-3 gentle suggestions)

${
  isVietnamese
    ? `Use Vietnamese language naturally and culturally appropriate. Be empathetic and supportive in your analysis.`
    : `Use English language naturally. Be empathetic and supportive in your analysis.`
}

Respond in this exact JSON format:
{
  "sentiment": {
    "score": 0.7,
    "label": "${isVietnamese ? "tích cực" : "positive"}",
    "confidence": 0.85
  },
  "mentalHealthIndicators": {
    "depressionSigns": false,
    "anxietySigns": true,
    "stressSigns": false,
    "riskLevel": "${isVietnamese ? "trung bình" : "medium"}",
    "details": "${
      isVietnamese
        ? "Người dùng đề cập đến lo lắng và vấn đề về giấc ngủ"
        : "User mentions worry and sleep issues"
    }"
  },
  "keywords": {
    "positive": ["${isVietnamese ? "vui vẻ, biết ơn" : "happy, grateful"}"],
    "negative": ["${isVietnamese ? "lo lắng, mệt mỏi" : "worried, tired"}"],
    "emotional": ["${isVietnamese ? "lo âu, hy vọng" : "anxious, hopeful"}"]
  },
  "recommendations": [
    "${
      isVietnamese
        ? "Hãy thử thực hành các bài tập thở khi cảm thấy lo âu"
        : "Consider practicing breathing exercises when feeling anxious"
    }",
    "${
      isVietnamese
        ? "Cố gắng duy trì lịch trình ngủ đều đặn"
        : "Try to maintain a regular sleep schedule"
    }"
  ]
}`;

    const result = await model.generateContent(analysisPrompt);
    const response = await result.response;
    const text = response.text();

    // Reuse robust extractor (duplicate here to avoid import cycles)
    const extractJson = (raw) => {
      try {
        return JSON.parse(raw);
      } catch (_) {}
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenceMatch && fenceMatch[1]) {
        const inside = fenceMatch[1].trim();
        try {
          return JSON.parse(inside);
        } catch (_) {}
      }
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        const slice = raw.substring(first, last + 1);
        try {
          return JSON.parse(slice);
        } catch (_) {}
      }
      throw new Error("AI did not return valid JSON");
    };

    const analysis = extractJson(text);
    analysis.aiPowered = true;
    return analysis;
  } catch (error) {
    console.error("❌ Error in sentiment analysis:", error.message);
    throw error;
  }
};

/**
 * Generate personalized improvement plans for premium users
 * @param {Object} userProfile - User's mental health profile
 * @param {Array} recentAnalyses - Recent sentiment analyses
 * @returns {Promise<Object>} Personalized improvement plan
 */
const generateImprovementPlan = async (
  userProfile,
  recentAnalyses,
  content = ""
) => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    // Detect language from content
    const userLanguage = detectUserLanguage(content);
    const isVietnamese = userLanguage === "vi";

    const planPrompt = `Create a personalized 7-day mental wellness improvement plan based on:

User Profile:
- Recent mood patterns: ${JSON.stringify(userProfile)}
- Sentiment analysis trends: ${JSON.stringify(recentAnalyses)}

${
  isVietnamese
    ? `IMPORTANT: The user wrote in Vietnamese, so please respond in Vietnamese (Tiếng Việt). All plan content, activities, tips, and titles should be in Vietnamese.`
    : `IMPORTANT: The user wrote in English, so please respond in English. All plan content, activities, tips, and titles should be in English.`
}

Create a supportive, evidence-based plan with:
1. Plan type (emotional_release, positivity_building, stress_management, etc.)
2. 7 daily activities (specific, actionable, 5-15 minutes each)
3. 3-5 practical tips
4. Motivational title

${
  isVietnamese
    ? `Use Vietnamese language naturally and culturally appropriate. Be empathetic and supportive in your plan.`
    : `Use English language naturally. Be empathetic and supportive in your plan.`
}

Respond ONLY with a single valid JSON object. Do not include any prose, introductions, explanations, or code fences. JSON must strictly match this schema:
{
  "planType": "emotional_release",
  "title": "${
    isVietnamese
      ? "Hành Trình Giải Phóng Cảm Xúc Cá Nhân"
      : "Your Personal Emotional Release Journey"
  }",
  "duration": "${isVietnamese ? "7 ngày" : "7 days"}",
  "activities": [
    {"day": 1, "activity": "${
      isVietnamese
        ? "Viết về cảm xúc hiện tại của bạn mà không phán xét"
        : "Write about your current feelings without judgment"
    }"},
    {"day": 2, "activity": "${
      isVietnamese
        ? "Thực hành kỹ thuật thở 4-7-8"
        : "Practice the 4-7-8 breathing technique"
    }"}
  ],
  "tips": [
    "${
      isVietnamese
        ? "Cho phép bản thân cảm nhận cảm xúc mà không cố gắng sửa chữa chúng"
        : "Allow yourself to feel emotions without trying to fix them"
    }",
    "${
      isVietnamese
        ? "Tiến bộ không phải là tuyến tính - một số ngày sẽ khó khăn hơn những ngày khác"
        : "Progress isn't linear - some days will be harder than others"
    }"
  ]
}`;

    const result = await model.generateContent(planPrompt);
    const response = await result.response;
    const text = response.text();

    // Robust JSON extraction
    const extractJson = (raw) => {
      // Direct parse
      try {
        return JSON.parse(raw);
      } catch (_) {}
      // Fenced code block ```json ... ``` or ``` ... ```
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenceMatch && fenceMatch[1]) {
        const inside = fenceMatch[1].trim();
        try {
          return JSON.parse(inside);
        } catch (_) {}
      }
      // Heuristic: extract first { ... last }
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        const slice = raw.substring(first, last + 1);
        try {
          return JSON.parse(slice);
        } catch (_) {}
      }
      throw new Error("AI did not return valid JSON");
    };

    const plan = extractJson(text);
    plan.aiPowered = true;
    return plan;
  } catch (error) {
    console.error("❌ Error generating improvement plan:", error.message);
    throw error;
  }
};

/**
 * AI-powered personal assistant for emotional support
 * @param {string} question - User's question or concern
 * @param {Object} context - User context (recent moods, etc.)
 * @returns {Promise<Object>} AI assistant response
 */
const getAssistantResponse = async (question, context = {}, content = "") => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    // Detect language from content or question
    const userLanguage = detectUserLanguage(content || question);
    const isVietnamese = userLanguage === "vi";

    const assistantPrompt = `You are a supportive mental health companion. The user asks: "${question}"

Context about the user:
${JSON.stringify(context)}

${
  isVietnamese
    ? `IMPORTANT: The user wrote in Vietnamese, so please respond in Vietnamese (Tiếng Việt). All responses, suggestions, and resources should be in Vietnamese.`
    : `IMPORTANT: The user wrote in English, so please respond in English. All responses, suggestions, and resources should be in English.`
}

Provide a compassionate, helpful response that:
- Acknowledges their feelings
- Offers gentle guidance
- Suggests healthy coping strategies
- Encourages professional help if needed
- Stays within ethical boundaries (not a replacement for therapy)

${
  isVietnamese
    ? `Use Vietnamese language naturally and culturally appropriate. Be empathetic and supportive in your response.`
    : `Use English language naturally. Be empathetic and supportive in your response.`
}

Respond in this JSON format:
{
  "response": "${
    isVietnamese
      ? "Một phản hồi hỗ trợ, đồng cảm..."
      : "A supportive, empathetic response..."
  }",
  "suggestions": [
    "${isVietnamese ? "Gợi ý thực tế 1" : "Practical suggestion 1"}",
    "${isVietnamese ? "Gợi ý thực tế 2" : "Practical suggestion 2"}"
  ],
  "resources": [
    "${
      isVietnamese
        ? "Tài nguyên sức khỏe tâm thần tùy chọn nếu có liên quan"
        : "Optional mental health resources if relevant"
    }"
  ]
}`;

    const result = await model.generateContent(assistantPrompt);
    const response = await result.response;
    const text = response.text();

    try {
      const assistantResponse = JSON.parse(text);
      assistantResponse.aiPowered = true;
      return assistantResponse;
    } catch (parseError) {
      const lines = text
        .split("\n")
        .map((l) => l.replace(/^[\d\-\*\.\s]+/, "").trim())
        .filter((l) => l.length > 5);
      return {
        response: lines[0] || "",
        suggestions: lines.slice(1, 3),
        aiPowered: true,
      };
    }
  } catch (error) {
    console.error("❌ Error in AI assistant:", error.message);
    throw error;
  }
};

/**
 * Analyze keyword frequency and emotional patterns
 * @param {Array} journalEntries - Array of journal entries
 * @returns {Object} Keyword analysis results
 */
const analyzeKeywords = (journalEntries) => {
  const allText = journalEntries
    .map((entry) => entry.content || "")
    .join(" ")
    .toLowerCase();

  // Detect language from content
  const userLanguage = detectUserLanguage(allText);
  const isVietnamese = userLanguage === "vi";

  // Emotional keyword categories
  const emotionalKeywords = isVietnamese
    ? {
        positive: [
          "vui",
          "hạnh phúc",
          "vui vẻ",
          "biết ơn",
          "yêu",
          "hào hứng",
          "bình yên",
          "tự tin",
          "hy vọng",
          "tự hào",
          "hài lòng",
        ],
        negative: [
          "buồn",
          "tức giận",
          "thất vọng",
          "tổn thương",
          "cô đơn",
          "choáng ngợp",
          "căng thẳng",
        ],
        anxiety: [
          "lo lắng",
          "lo âu",
          "bồn chồn",
          "hoảng sợ",
          "sợ hãi",
          "không chắc chắn",
          "bất an",
        ],
        depression: [
          "trầm cảm",
          "tuyệt vọng",
          "trống rỗng",
          "vô giá trị",
          "mệt mỏi",
          "tê liệt",
          "lạc lõng",
        ],
      }
    : {
        positive: [
          "happy",
          "joy",
          "grateful",
          "love",
          "excited",
          "peaceful",
          "confident",
          "hopeful",
          "proud",
          "content",
        ],
        negative: [
          "sad",
          "angry",
          "frustrated",
          "disappointed",
          "hurt",
          "lonely",
          "overwhelmed",
          "stressed",
        ],
        anxiety: [
          "worried",
          "anxious",
          "nervous",
          "panic",
          "fear",
          "uncertain",
          "restless",
        ],
        depression: [
          "depressed",
          "hopeless",
          "empty",
          "worthless",
          "tired",
          "numb",
          "lost",
        ],
      };

  const keywordFrequency = {};
  const categoryFrequency = {
    positive: 0,
    negative: 0,
    anxiety: 0,
    depression: 0,
  };

  // Count keyword frequencies
  Object.entries(emotionalKeywords).forEach(([category, words]) => {
    words.forEach((word) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      const matches = allText.match(regex) || [];
      const count = matches.length;

      if (count > 0) {
        keywordFrequency[word] = count;
        categoryFrequency[category] += count;
      }
    });
  });

  // Calculate emotional balance
  const totalEmotional = Object.values(categoryFrequency).reduce(
    (sum, count) => sum + count,
    0
  );
  const emotionalBalance =
    totalEmotional > 0
      ? {
          positiveRatio: (
            (categoryFrequency.positive / totalEmotional) *
            100
          ).toFixed(1),
          negativeRatio: (
            (categoryFrequency.negative / totalEmotional) *
            100
          ).toFixed(1),
          anxietyRatio: (
            (categoryFrequency.anxiety / totalEmotional) *
            100
          ).toFixed(1),
          depressionRatio: (
            (categoryFrequency.depression / totalEmotional) *
            100
          ).toFixed(1),
        }
      : null;

  return {
    keywordFrequency: Object.entries(keywordFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20), // Top 20 most frequent emotional keywords
    categoryFrequency,
    emotionalBalance,
    totalWords: allText.split(" ").length,
    totalEmotionalWords: totalEmotional,
    insights: generateKeywordInsights(
      categoryFrequency,
      emotionalBalance,
      allText
    ),
  };
};

/**
 * Generate insights from keyword analysis
 */
const generateKeywordInsights = (categoryFreq, balance, content = "") => {
  const insights = [];
  const userLanguage = detectUserLanguage(content);
  const isVietnamese = userLanguage === "vi";

  if (balance) {
    if (parseFloat(balance.positiveRatio) > 60) {
      insights.push(
        isVietnamese
          ? "✨ Bài viết của bạn thể hiện một cái nhìn tích cực - điều đó thật tuyệt vời!"
          : "✨ Your writing shows a predominantly positive outlook - that's wonderful!"
      );
    }

    if (parseFloat(balance.anxietyRatio) > 30) {
      insights.push(
        isVietnamese
          ? "⚠️ Bạn thường xuyên đề cập đến những cảm xúc lo âu. Hãy cân nhắc các kỹ thuật quản lý căng thẳng."
          : "⚠️ You frequently mention anxiety-related feelings. Consider stress management techniques."
      );
    }

    if (parseFloat(balance.depressionRatio) > 25) {
      insights.push(
        isVietnamese
          ? "💙 Bạn đã đề cập đến một số cảm xúc khó khăn. Hãy nhớ rằng việc tìm kiếm sự hỗ trợ là điều bình thường."
          : "💙 You've mentioned some difficult emotions. Remember that it's okay to seek support."
      );
    }

    if (
      categoryFreq.positive >
      categoryFreq.negative + categoryFreq.anxiety + categoryFreq.depression
    ) {
      insights.push(
        isVietnamese
          ? "🌟 Từ vựng cảm xúc của bạn nghiêng về tích cực - bạn đang xây dựng khả năng phục hồi cảm xúc!"
          : "🌟 Your emotional vocabulary leans positive - you're building emotional resilience!"
      );
    }
  }

  if (insights.length === 0) {
    insights.push(
      isVietnamese
        ? "📝 Hãy tiếp tục viết nhật ký để xây dựng một bức tranh rõ ràng hơn về các mẫu cảm xúc của bạn."
        : "📝 Keep journaling to build a clearer picture of your emotional patterns."
    );
  }

  return insights;
};

/**
 * Generate recommendations based on sentiment analysis
 */
const generateRecommendations = (
  depressionCount,
  anxietyCount,
  positiveCount,
  content = ""
) => {
  const recommendations = [];
  const userLanguage = detectUserLanguage(content);
  const isVietnamese = userLanguage === "vi";

  if (depressionCount >= 2) {
    recommendations.push(
      isVietnamese
        ? "Hãy cân nhắc liên hệ với chuyên gia sức khỏe tâm thần để được hỗ trợ"
        : "Consider reaching out to a mental health professional for support"
    );
    recommendations.push(
      isVietnamese
        ? "Hãy thử tham gia vào các hoạt động mà trước đây đã mang lại niềm vui cho bạn"
        : "Try to engage in activities that previously brought you joy"
    );
  }

  if (anxietyCount >= 2) {
    recommendations.push(
      isVietnamese
        ? "Thực hành các bài tập thở sâu khi cảm thấy choáng ngợp"
        : "Practice deep breathing exercises when feeling overwhelmed"
    );
    recommendations.push(
      isVietnamese
        ? "Hãy thử các kỹ thuật grounding: đặt tên 5 thứ bạn có thể nhìn thấy, 4 thứ bạn có thể chạm, 3 thứ bạn có thể nghe"
        : "Try grounding techniques: name 5 things you can see, 4 you can touch, 3 you can hear"
    );
  }

  if (positiveCount >= 2) {
    recommendations.push(
      isVietnamese
        ? "Làm tốt lắm khi nhận ra những khoảnh khắc tích cực - hãy tiếp tục xây dựng trên điểm mạnh này"
        : "Great job recognizing positive moments - continue building on this strength"
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      isVietnamese
        ? "Hãy tiếp tục viết nhật ký để theo dõi các mẫu cảm xúc của bạn"
        : "Continue journaling to track your emotional patterns"
    );
    recommendations.push(
      isVietnamese
        ? "Hãy nhớ thực hành lòng tự trắc ẩn"
        : "Remember to practice self-compassion"
    );
  }

  return recommendations;
};

/**
 * Detect user language preference from content
 * @param {string} content - Journal content to analyze
 * @returns {string} 'vi' for Vietnamese, 'en' for English
 */
const detectUserLanguage = (content = "") => {
  if (!content || typeof content !== "string") {
    return "vi"; // Default to Vietnamese
  }

  // Vietnamese character patterns
  const vietnamesePatterns = [
    /[àáạảãâầấậẩẫăằắặẳẵ]/gi,
    /[èéẹẻẽêềếệểễ]/gi,
    /[ìíịỉĩ]/gi,
    /[òóọỏõôồốộổỗơờớợởỡ]/gi,
    /[ùúụủũưừứựửữ]/gi,
    /[ỳýỵỷỹ]/gi,
    /[đ]/gi,
    /[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]/gi,
    /[ÈÉẸẺẼÊỀẾỆỂỄ]/gi,
    /[ÌÍỊỈĨ]/gi,
    /[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]/gi,
    /[ÙÚỤỦŨƯỪỨỰỬỮ]/gi,
    /[ỲÝỴỶỸ]/gi,
    /[Đ]/gi,
  ];

  // Count Vietnamese characters
  let vietnameseCount = 0;
  vietnamesePatterns.forEach((pattern) => {
    const matches = content.match(pattern);
    if (matches) {
      vietnameseCount += matches.length;
    }
  });

  // If content has Vietnamese characters, return Vietnamese
  if (vietnameseCount > 0) {
    return "vi";
  }

  // Check for common Vietnamese words
  const vietnameseWords = [
    "tôi",
    "mình",
    "của",
    "và",
    "là",
    "có",
    "được",
    "sẽ",
    "đã",
    "đang",
    "hôm nay",
    "ngày mai",
    "hôm qua",
    "cảm thấy",
    "nghĩ",
    "biết",
    "muốn",
    "cần",
    "phải",
    "nên",
    "không",
    "chưa",
    "đã",
    "sẽ",
    "đang",
    "vẫn",
    "rất",
    "quá",
    "khá",
    "hơi",
    "cực kỳ",
    "hoàn toàn",
    "tuyệt đối",
  ];

  const contentLower = content.toLowerCase();
  const vietnameseWordCount = vietnameseWords.filter((word) =>
    contentLower.includes(word)
  ).length;

  // If content has Vietnamese words, return Vietnamese
  if (vietnameseWordCount > 0) {
    return "vi";
  }

  // Default to Vietnamese for Vietnamese users
  return "vi";
};

/**
 * Analyze emotions and sentiment from journal content
 * @param {string} content - Journal content to analyze
 * @returns {Promise<Object>} Comprehensive emotion analysis
 */
const analyzeEmotionAndSentiment = async (content) => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    // Detect language from content
    const userLanguage = detectUserLanguage(content);
    const isVietnamese = userLanguage === "vi";

    const prompt = `Analyze the following journal entry for emotions, sentiment, and mental health indicators. Provide a comprehensive analysis in JSON format.

Journal Content: "${content}"

${
  isVietnamese
    ? `IMPORTANT: The user wrote in Vietnamese, so please respond in Vietnamese (Tiếng Việt). All analysis results, suggestions, and recommendations should be in Vietnamese.`
    : `IMPORTANT: The user wrote in English, so please respond in English. All analysis results, suggestions, and recommendations should be in English.`
}

${
  isVietnamese
    ? `Use Vietnamese language naturally and culturally appropriate. Be empathetic and supportive in your analysis.`
    : `Use English language naturally. Be empathetic and supportive in your analysis.`
}

Please analyze and return a JSON object with the following structure:
{
  "emotionAnalysis": {
    "primaryEmotion": "${
      isVietnamese
        ? "string (lo âu, buồn bã, vui vẻ, tức giận, sợ hãi, etc.)"
        : "string (anxiety, sadness, joy, anger, fear, etc.)"
    }",
    "emotionScore": "number (0-10)",
    "confidence": "number (0-1)"
  },
  "sentimentAnalysis": {
    "overallSentiment": "${
      isVietnamese
        ? "string (tích cực, tiêu cực, trung tính)"
        : "string (positive, negative, neutral)"
    }",
    "sentimentScore": "number (-1 to 1)"
  },
  "mentalHealthIndicators": {
    "stressLevel": "${
      isVietnamese
        ? "string (thấp, trung bình, cao, rất cao)"
        : "string (low, moderate, high, very_high)"
    }",
    "anxietyLevel": "${
      isVietnamese
        ? "string (thấp, trung bình, cao, rất cao)"
        : "string (low, moderate, high, very_high)"
    }",
    "depressionSigns": "boolean",
    "riskLevel": "${
      isVietnamese
        ? "string (thấp, trung bình, cao)"
        : "string (low, medium, high)"
    }"
  },
  "improvementSuggestions": {
    "immediateActions": ["${
      isVietnamese
        ? "array of immediate actions in Vietnamese"
        : "array of immediate actions in English"
    }"],
    "shortTermGoals": ["${
      isVietnamese
        ? "array of short-term goals in Vietnamese"
        : "array of short-term goals in English"
    }"],
    "longTermStrategies": ["${
      isVietnamese
        ? "array of long-term strategies in Vietnamese"
        : "array of long-term strategies in English"
    }"],
    "timeframes": {
      "immediate": "${
        isVietnamese
          ? "string (e.g., 'Trong 30 phút tới')"
          : "string (e.g., 'Next 30 minutes')"
      }",
      "shortTerm": "${
        isVietnamese
          ? "string (e.g., 'Trong 1-2 tuần tới')"
          : "string (e.g., 'Next 1-2 weeks')"
      }",
      "longTerm": "${
        isVietnamese
          ? "string (e.g., 'Trong 1-3 tháng tới')"
          : "string (e.g., 'Next 1-3 months')"
      }"
    }
  },
  "keywords": {
    "emotional": ["${
      isVietnamese
        ? "array of emotional keywords in Vietnamese"
        : "array of emotional keywords in English"
    }"],
    "behavioral": ["${
      isVietnamese
        ? "array of behavioral keywords in Vietnamese"
        : "array of behavioral keywords in English"
    }"],
    "physical": ["${
      isVietnamese
        ? "array of physical keywords in Vietnamese"
        : "array of physical keywords in English"
    }"]
  }
}

${
  isVietnamese
    ? `Focus on providing practical, actionable advice in Vietnamese. Be empathetic and supportive in your analysis. Use natural Vietnamese language that is culturally appropriate.`
    : `Focus on providing practical, actionable advice in English. Be empathetic and supportive in your analysis.`
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean and parse JSON response
    let cleanText = text.trim();

    // Remove markdown code blocks if present
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Try to find JSON object in the response
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }

    const analysis = JSON.parse(cleanText);

    return {
      ...analysis,
      aiPowered: true,
    };
  } catch (error) {
    console.error("Error in emotion analysis:", error);

    // Fallback response if AI fails
    return {
      emotionAnalysis: {
        primaryEmotion: "neutral",
        emotionScore: 5.0,
        confidence: 0.5,
      },
      sentimentAnalysis: {
        overallSentiment: "neutral",
        sentimentScore: 0.0,
      },
      mentalHealthIndicators: {
        stressLevel: "moderate",
        anxietyLevel: "moderate",
        depressionSigns: false,
        riskLevel: "low",
      },
      improvementSuggestions: {
        immediateActions: [
          "Take 5 deep breaths",
          "Go for a short walk",
          "Listen to calming music",
        ],
        shortTermGoals: [
          "Practice daily meditation",
          "Get 8 hours of sleep",
          "Exercise regularly",
        ],
        longTermStrategies: [
          "Consider therapy or counseling",
          "Develop stress management techniques",
          "Build a support network",
        ],
        timeframes: {
          immediate: "Next 30 minutes",
          shortTerm: "Next 1-2 weeks",
          longTerm: "Next 1-3 months",
        },
      },
      keywords: {
        emotional: ["feeling", "emotion"],
        behavioral: ["behavior", "action"],
        physical: ["body", "physical"],
      },
      aiPowered: false,
    };
  }
};

/**
 * Perform comprehensive mental health assessment
 * @param {string} content - Journal content to assess
 * @returns {Promise<Object>} Mental health assessment results
 */
const performMentalHealthAssessment = async (content) => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    // Detect language from content
    const userLanguage = detectUserLanguage(content);
    const isVietnamese = userLanguage === "vi";

    const prompt = `Perform a comprehensive mental health assessment of the following journal entry. Provide detailed analysis in JSON format.

Journal Content: "${content}"

${
  isVietnamese
    ? `IMPORTANT: The user wrote in Vietnamese, so please respond in Vietnamese (Tiếng Việt). All assessment results, recommendations, and plans should be in Vietnamese.`
    : `IMPORTANT: The user wrote in English, so please respond in English. All assessment results, recommendations, and plans should be in English.`
}

${
  isVietnamese
    ? `Use Vietnamese language naturally and culturally appropriate. Be empathetic and supportive in your assessment.`
    : `Use English language naturally. Be empathetic and supportive in your assessment.`
}

Please analyze and return a JSON object with the following structure:
{
  "assessment": {
    "overallScore": "number (0-10)",
    "mentalHealthStatus": "${
      isVietnamese
        ? "string (xuất sắc, tốt, khá, đáng lo ngại, nghiêm trọng)"
        : "string (excellent, good, fair, concerning, critical)"
    }",
    "assessmentDate": "string (ISO date)"
  },
  "depressionIndicators": {
    "score": "number (0-10)",
    "level": "${
      isVietnamese
        ? "string (tối thiểu, nhẹ, trung bình, nghiêm trọng)"
        : "string (minimal, mild, moderate, severe)"
    }",
    "symptoms": ["${
      isVietnamese
        ? "array of identified symptoms in Vietnamese"
        : "array of identified symptoms in English"
    }"],
    "recommendations": ["${
      isVietnamese
        ? "array of specific recommendations in Vietnamese"
        : "array of specific recommendations in English"
    }"]
  },
  "anxietyIndicators": {
    "score": "number (0-10)",
    "level": "${
      isVietnamese
        ? "string (tối thiểu, nhẹ, trung bình, nghiêm trọng)"
        : "string (minimal, mild, moderate, severe)"
    }",
    "symptoms": ["${
      isVietnamese
        ? "array of identified symptoms in Vietnamese"
        : "array of identified symptoms in English"
    }"],
    "recommendations": ["${
      isVietnamese
        ? "array of specific recommendations in Vietnamese"
        : "array of specific recommendations in English"
    }"]
  },
  "stressIndicators": {
    "score": "number (0-10)",
    "level": "${
      isVietnamese
        ? "string (thấp, trung bình, cao, rất cao)"
        : "string (low, moderate, high, very_high)"
    }",
    "sources": ["${
      isVietnamese
        ? "array of stress sources in Vietnamese"
        : "array of stress sources in English"
    }"],
    "recommendations": ["${
      isVietnamese
        ? "array of specific recommendations in Vietnamese"
        : "array of specific recommendations in English"
    }"]
  },
  "riskAssessment": {
    "overallRisk": "${
      isVietnamese
        ? "string (thấp, trung bình, cao, rất cao)"
        : "string (low, medium, high, very_high)"
    }",
    "immediateConcerns": ["${
      isVietnamese
        ? "array of immediate concerns in Vietnamese"
        : "array of immediate concerns in English"
    }"],
    "followUpNeeded": "boolean",
    "professionalHelpRecommended": "boolean"
  },
  "personalizedPlan": {
    "dailyActions": ["${
      isVietnamese
        ? "array of daily actions in Vietnamese"
        : "array of daily actions in English"
    }"],
    "weeklyGoals": ["${
      isVietnamese
        ? "array of weekly goals in Vietnamese"
        : "array of weekly goals in English"
    }"],
    "monthlyObjectives": ["${
      isVietnamese
        ? "array of monthly objectives in Vietnamese"
        : "array of monthly objectives in English"
    }"],
    "resources": ["${
      isVietnamese
        ? "array of helpful resources in Vietnamese"
        : "array of helpful resources in English"
    }"]
  }
}

${
  isVietnamese
    ? `Be thorough, empathetic, and provide actionable recommendations in Vietnamese. Use natural Vietnamese language that is culturally appropriate. If serious concerns are detected, recommend professional help in Vietnamese.`
    : `Be thorough, empathetic, and provide actionable recommendations in English. If serious concerns are detected, recommend professional help in English.`
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean and parse JSON response
    let cleanText = text.trim();

    // Remove markdown code blocks if present
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Try to find JSON object in the response
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }

    const assessment = JSON.parse(cleanText);

    return {
      ...assessment,
      aiPowered: true,
    };
  } catch (error) {
    console.error("Error in mental health assessment:", error);

    // Fallback response if AI fails
    return {
      assessment: {
        overallScore: 5.0,
        mentalHealthStatus: "fair",
        assessmentDate: new Date().toISOString(),
      },
      depressionIndicators: {
        score: 3.0,
        level: "minimal",
        symptoms: ["No significant depression indicators detected"],
        recommendations: ["Continue monitoring mood", "Practice self-care"],
      },
      anxietyIndicators: {
        score: 3.0,
        level: "minimal",
        symptoms: ["No significant anxiety indicators detected"],
        recommendations: [
          "Practice relaxation techniques",
          "Maintain regular sleep schedule",
        ],
      },
      stressIndicators: {
        score: 4.0,
        level: "moderate",
        sources: ["General life stress"],
        recommendations: ["Practice stress management", "Take regular breaks"],
      },
      riskAssessment: {
        overallRisk: "low",
        immediateConcerns: [],
        followUpNeeded: false,
        professionalHelpRecommended: false,
      },
      personalizedPlan: {
        dailyActions: [
          "Practice deep breathing for 5 minutes",
          "Take a 10-minute walk",
          "Write in your journal",
        ],
        weeklyGoals: [
          "Exercise 3 times this week",
          "Connect with friends or family",
          "Practice mindfulness daily",
        ],
        monthlyObjectives: [
          "Develop a consistent self-care routine",
          "Build stress management skills",
          "Monitor mental health patterns",
        ],
        resources: [
          "Mental health hotlines",
          "Meditation apps",
          "Support groups",
        ],
      },
      aiPowered: false,
    };
  }
};

/**
 * Check if AI service is available
 * @returns {boolean} True if AI is available
 */
const isAIAvailable = () => {
  return !!model;
};

module.exports = {
  generateWritingPrompts,
  generateAdvancedPrompts,
  generateMoodReflections,
  analyzeSentiment,
  generateImprovementPlan,
  getAssistantResponse,
  analyzeKeywords,
  analyzeEmotionAndSentiment,
  performMentalHealthAssessment,
  isAIAvailable,
  detectUserLanguage,
};
