/**
 * AI Service - Nano-GPT API Integration
 */

const https = require('https');

// Available AI models
const AI_MODELS = {
    'deepseek-v3': { id: 'deepseek/deepseek-v3.2:thinking', name: 'DeepSeek V3.2 (Recommended)' },
    'glm-4-7': { id: 'zai-org/glm-4.7:thinking', name: 'GLM 4.7 Thinking' },
    'llama-3-1-405b': { id: 'Meta-Llama-3-1-405B-Instruct-FP8', name: 'Llama 3.1 Large' },
    'llama-4-maverick': { id: 'llama-4-maverick', name: 'Llama 4 Maverick' },
    'llama-3-3-70b': { id: 'llama-3.3-70b', name: 'Llama 3.3 (70B)' },
    'minimax-m2': { id: 'minimax/minimax-m2.1', name: 'MiniMax M2.1' },
    'mistral-large': { id: 'mistralai/mistral-large-3-675b-instruct-2512', name: 'Mistral Large 3' },
    'mistral-small': { id: 'mistral-small-31', name: 'Mistral Small 3.1 (24B)' },
    'glm-4-5-air': { id: 'glm-4.5-air', name: 'GLM 4.5 Air' },
    'gpt-oss-120b': { id: 'gpt-oss-120b', name: 'GPT OSS 120B' },
    'gpt-oss-20b': { id: 'gpt-oss-20b', name: 'GPT OSS 20B' },
    'mimo-v2': { id: 'mimo-v2-flash-thinking', name: 'Xiaomi MIMO V2 Flash Thinking' },
    'kimi-k2': { id: 'moonshotai/kimi-k2-thinking', name: 'Kimi K2 Thinking' }
};

/**
 * Get list of available AI models
 */
function getModels() {
    return Object.entries(AI_MODELS).map(([key, value]) => ({
        key,
        id: value.id,
        name: value.name
    }));
}

/**
 * Make a request to the Nano-GPT API
 * @param {string} modelKey - The model key to use
 * @param {Array} messages - Array of message objects with role and content
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - The AI response content
 */
async function chat(modelKey, messages, options = {}) {
    const model = AI_MODELS[modelKey];
    if (!model) {
        throw new Error(`Invalid model key: ${modelKey}`);
    }

    const apiKey = process.env.NANO_API_KEY;
    const apiUrl = process.env.NANO_API_URL || 'https://nano-gpt.com/api/v1/chat/completions';

    if (!apiKey) {
        throw new Error('NANO_API_KEY environment variable is not set');
    }

    const requestBody = JSON.stringify({
        model: model.id,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 4096
    });

    return new Promise((resolve, reject) => {
        const url = new URL(apiUrl);
        
        const requestOptions = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestBody)
            },
            timeout: 300000 // 5 minutes
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    
                    if (res.statusCode !== 200) {
                        reject(new Error(response.error?.message || `API error: ${res.statusCode}`));
                        return;
                    }

                    if (response.choices && response.choices[0] && response.choices[0].message) {
                        resolve(response.choices[0].message.content);
                    } else {
                        reject(new Error('Invalid API response format'));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse API response: ${e.message}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error(`API request failed: ${e.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('API request timed out'));
        });

        req.write(requestBody);
        req.end();
    });
}

/**
 * Generate a lesson using AI
 */
async function generateLesson(subject, topic, difficulty, length, focusAreas, modelKey) {
    const prompt = `You are an expert ACT tutor. Generate a comprehensive lesson on the following:

Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}
Lesson Length: ${length}
Focus Areas: ${focusAreas.join(', ')}

Create a well-structured lesson that includes:
1. Clear learning objectives
2. Introduction to the topic
3. Main content with explanations
4. Examples (use proper mathematical notation with $...$ for inline math and $$...$$ for display math)
5. Practice problems with solutions
6. Key takeaways and test strategies
7. Summary

Format the lesson in Markdown with proper headings (##, ###), bullet points, and code blocks where appropriate.`;

    const messages = [
        { role: 'system', content: 'You are an expert ACT tutor helping students prepare for the ACT test. Provide clear, accurate, and helpful educational content.' },
        { role: 'user', content: prompt }
    ];

    return await chat(modelKey || 'deepseek-v3', messages, { max_tokens: 8192 });
}

/**
 * Generate quiz questions using AI
 */
async function generateQuiz(subject, topic, numQuestions, difficulty, modelKey) {
    const prompt = `Generate ${numQuestions} multiple-choice questions for ACT ${subject} on the topic: ${topic}
Difficulty level: ${difficulty}

For each question, provide:
1. The question text (use LaTeX notation $...$ for inline math, $$...$$ for display math if needed)
2. Four answer options labeled A, B, C, D
3. The correct answer (A, B, C, or D)
4. A detailed explanation of why the correct answer is right

Format your response as a JSON array with this structure:
[
  {
    "question": "Question text here",
    "options": {
      "A": "First option",
      "B": "Second option",
      "C": "Third option",
      "D": "Fourth option"
    },
    "correctAnswer": "A",
    "explanation": "Explanation here"
  }
]

Only output the JSON array, no other text.`;

    const messages = [
        { role: 'system', content: 'You are an expert ACT test question writer. Create realistic, challenging questions that match the ACT format and difficulty.' },
        { role: 'user', content: prompt }
    ];

    const response = await chat(modelKey || 'deepseek-v3', messages, { max_tokens: 8192 });
    
    // Parse the JSON response
    try {
        // Extract JSON from response (in case there's extra text)
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(response);
    } catch (e) {
        throw new Error('Failed to parse quiz questions from AI response');
    }
}

/**
 * Generate practice test section using AI
 */
async function generateTestSection(section, numQuestions, modelKey) {
    const sectionInfo = {
        english: { name: 'English', topics: 'grammar, punctuation, sentence structure, rhetorical skills' },
        math: { name: 'Mathematics', topics: 'algebra, geometry, trigonometry, statistics, pre-calculus' },
        reading: { name: 'Reading', topics: 'prose fiction, social science, humanities, natural science passages' },
        science: { name: 'Science', topics: 'data representation, research summaries, conflicting viewpoints' }
    };

    const info = sectionInfo[section.toLowerCase()];
    if (!info) {
        throw new Error(`Invalid section: ${section}`);
    }

    const prompt = `Generate a realistic ACT ${info.name} section with ${numQuestions} questions.
Topics to cover: ${info.topics}

For reading/science sections, include passages followed by questions.
For math/english, create standalone questions or questions with short passages.

Format your response as JSON:
{
  "section": "${section}",
  "passages": [
    {
      "text": "Passage text here if applicable",
      "questions": [
        {
          "question": "Question text",
          "options": {"A": "", "B": "", "C": "", "D": ""},
          "correctAnswer": "A",
          "explanation": ""
        }
      ]
    }
  ]
}

Only output valid JSON.`;

    const messages = [
        { role: 'system', content: 'You are an expert ACT test creator. Generate realistic test content that matches the official ACT format.' },
        { role: 'user', content: prompt }
    ];

    const response = await chat(modelKey || 'deepseek-v3', messages, { max_tokens: 16384 });
    
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(response);
    } catch (e) {
        throw new Error('Failed to parse test section from AI response');
    }
}

/**
 * Chat with AI tutor
 */
async function chatWithTutor(messages, modelKey) {
    const systemMessage = {
        role: 'system',
        content: `You are an expert ACT tutor. Help students understand concepts, solve problems, and prepare for the ACT test.

Guidelines:
- Be encouraging and supportive
- Explain concepts clearly with examples
- Use proper mathematical notation (LaTeX: $...$ for inline, $$...$$ for display)
- Reference specific ACT test strategies when relevant
- If asked to create quizzes or practice problems, format them clearly
- Provide step-by-step solutions when solving problems`
    };

    const allMessages = [systemMessage, ...messages];
    return await chat(modelKey || 'deepseek-v3', allMessages);
}

/**
 * Generate a study plan using AI
 */
async function generateStudyPlan(params, modelKey) {
    const prompt = `Create a personalized ACT study plan based on the following:

Current Score: ${params.currentScore || 'Not taken yet'}
Target Score: ${params.targetScore}
Test Date: ${params.testDate}
Study Hours Per Day: ${params.hoursPerDay}
Study Days Per Week: ${params.daysPerWeek.join(', ')}
Weak Subjects: ${params.weakSubjects.join(', ')}
Strong Subjects: ${params.strongSubjects.join(', ')}
Learning Style: ${params.learningStyle}
Study Time Preference: ${params.timePreference.join(', ')}
Other Commitments: ${params.otherCommitments || 'None specified'}

Create a detailed week-by-week study plan that:
1. Focuses more time on weak areas
2. Maintains skills in strong areas
3. Includes practice tests at strategic intervals
4. Has specific daily tasks with time allocations
5. Includes rest days and review sessions
6. Sets milestone goals

Format as JSON:
{
  "summary": "Brief overview of the plan",
  "totalWeeks": number,
  "estimatedImprovement": number,
  "weeks": [
    {
      "week": 1,
      "focus": "Main focus for the week",
      "goals": ["Goal 1", "Goal 2"],
      "days": [
        {
          "day": "Monday",
          "tasks": [
            {"time": "6:00 PM - 7:00 PM", "subject": "Math", "activity": "Description", "resources": ""}
          ]
        }
      ]
    }
  ],
  "milestones": [
    {"week": 2, "milestone": "Complete algebra review", "targetScore": 24}
  ]
}

Only output valid JSON.`;

    const messages = [
        { role: 'system', content: 'You are an expert ACT prep tutor and study coach. Create effective, personalized study plans.' },
        { role: 'user', content: prompt }
    ];

    const response = await chat(modelKey || 'deepseek-v3', messages, { max_tokens: 8192 });
    
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(response);
    } catch (e) {
        throw new Error('Failed to parse study plan from AI response');
    }
}

/**
 * Grade an essay using AI
 */
async function gradeEssay(prompt, essay, modelKey) {
    const gradePrompt = `You are an ACT Writing grader. Grade the following essay based on the ACT Writing rubric.

PROMPT:
${prompt}

STUDENT ESSAY:
${essay}

Provide scores (1-6) for each domain and detailed feedback:

1. Ideas and Analysis (1-6): How well does the writer generate and analyze ideas?
2. Development and Support (1-6): How well are ideas developed with reasoning and examples?
3. Organization (1-6): How well is the essay organized?
4. Language Use and Conventions (1-6): How well does the writer use language?

Format your response as JSON:
{
  "scores": {
    "ideasAndAnalysis": 4,
    "developmentAndSupport": 4,
    "organization": 4,
    "languageUse": 4,
    "overall": 8
  },
  "feedback": {
    "ideasAndAnalysis": "Detailed feedback...",
    "developmentAndSupport": "Detailed feedback...",
    "organization": "Detailed feedback...",
    "languageUse": "Detailed feedback..."
  },
  "strengths": ["Strength 1", "Strength 2"],
  "improvements": ["Improvement 1", "Improvement 2"],
  "grammarIssues": [
    {"original": "text with error", "corrected": "corrected text", "explanation": "why"}
  ],
  "overallComments": "Summary of the essay performance"
}

Only output valid JSON.`;

    const messages = [
        { role: 'system', content: 'You are an experienced ACT Writing grader. Provide fair, constructive, and detailed feedback.' },
        { role: 'user', content: gradePrompt }
    ];

    const response = await chat(modelKey || 'deepseek-v3', messages, { max_tokens: 4096 });
    
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(response);
    } catch (e) {
        throw new Error('Failed to parse essay grading from AI response');
    }
}

/**
 * Generate flashcards from content using AI
 */
async function generateFlashcards(topic, count, modelKey) {
    const prompt = `Generate ${count} flashcards for ACT preparation on the topic: ${topic}

Each flashcard should have:
- A clear, concise front (question or term)
- A comprehensive back (answer or definition)
- Use LaTeX for math ($...$ inline, $$...$$ display)

Format as JSON array:
[
  {
    "front": "What is the quadratic formula?",
    "back": "The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ where $ax^2 + bx + c = 0$",
    "tags": ["math", "algebra"]
  }
]

Only output the JSON array.`;

    const messages = [
        { role: 'system', content: 'You are an expert ACT tutor creating study flashcards.' },
        { role: 'user', content: prompt }
    ];

    const response = await chat(modelKey || 'deepseek-v3', messages, { max_tokens: 4096 });
    
    try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(response);
    } catch (e) {
        throw new Error('Failed to parse flashcards from AI response');
    }
}

/**
 * Generate an essay prompt using AI
 */
async function generateEssayPrompt(category, modelKey) {
    const prompt = `Generate an ACT Writing-style essay prompt about ${category || 'a contemporary issue'}.

The prompt should:
1. Present a debatable issue
2. Provide three different perspectives
3. Include clear instructions

Format as JSON:
{
  "topic": "Brief topic description",
  "introduction": "Context and background about the issue",
  "perspectives": [
    {"name": "Perspective One", "description": "First viewpoint explained"},
    {"name": "Perspective Two", "description": "Second viewpoint explained"},
    {"name": "Perspective Three", "description": "Third viewpoint explained"}
  ],
  "instructions": "Essay task instructions"
}

Only output valid JSON.`;

    const messages = [
        { role: 'system', content: 'You are an expert ACT Writing prompt creator.' },
        { role: 'user', content: prompt }
    ];

    const response = await chat(modelKey || 'deepseek-v3', messages, { max_tokens: 2048 });
    
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(response);
    } catch (e) {
        throw new Error('Failed to parse essay prompt from AI response');
    }
}

module.exports = {
    getModels,
    chat,
    generateLesson,
    generateQuiz,
    generateTestSection,
    chatWithTutor,
    generateStudyPlan,
    gradeEssay,
    generateFlashcards,
    generateEssayPrompt
};
