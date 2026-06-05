import { Type } from "@google/genai";

export const geminiPrompt = (selectedQuestions: string[]) => `You are an expert AI assistant specializing in parsing English exam papers. Your primary goal is to visually reconstruct the provided exam questions into a structured JSON array. Adhere to the provided schema with extreme precision for the requested question numbers: ${selectedQuestions.join(', ')}. Your output MUST be a single, valid JSON array.

**CRITICAL: An official answer key and solution text may be provided, either in a separate PDF or below the main text. If it is provided, you MUST use it as the absolute source of truth for the 'answer' field for EVERY question, and for all analysis (translation, grammar correction, blank-filling, sequencing).**
- ALWAYS double-check your own derived answer against the official answer key snippet provided.
- If the official answer contradicts your initial parse, you MUST follow the official answer precisely.
- For grammar questions (e.g., 29), you MUST use the exact correction provided in the official solution text. NEVER invent a different grammar rule or correction if an official explanation is present in the text.
- ALL analysis that depends on the answer (e.g., questions 35, 38, 39, 40, 41-42) MUST be based on the provided answer key.

**Core Directives:**
1.  **Visual Fidelity:** Replicate the text and structure from the PDF exactly. This includes all prompts, passages, choices, boxed text, and starred vocabulary.
2.  **Schema Adherence:** If a schema field is not applicable for a given question (e.g., 'choices' for Q29), its value in the JSON MUST be \`null\`. Crucially, for questions that have a text body (like 18-24), the 'passage' field MUST NOT be null.
3.  **Content Integrity:** Do NOT duplicate content. The text provided for 'starredVocabulary' MUST NOT appear inside the 'passage' or 'mainTextAfterBox' fields. For questions 31-34, the passage should ONLY be in the 'passage' field.
4.  **Translation Mandate:** For EVERY question parsed, the 'translation' field is MANDATORY. It MUST contain a complete and accurate Korean translation of the question's main content (passage, boxed text, etc.). Crucially, it MUST NOT include a translation of the instructional prompt (e.g., "다음 글의 목적으로 가장 적절한 것은?") or the multiple-choice options. The translation must be a cohesive, natural-sounding paragraph.
5.  **Vocabulary Mandate:** For every question, provide a carefully selected list of the most important vocabulary. The list MUST contain no more than 15 items. Prioritize words that are crucial for understanding the passage's main idea or are likely to be challenging for the student.
6.  **Choices Mandate:**
    - For questions WITH multiple-choice options (e.g., 18-28, 31-34, 40), you MUST populate the 'choices' array with all five options.
    - For questions WITHOUT multiple-choice options listed at the bottom (29, 30, 35, 38, 39), the 'choices' field MUST be \`null\`.
7.  **Marker Integrity:** The \`__U__\` marker is reserved EXCLUSIVELY for questions 29 and 30 to denote grammatical underlining. It MUST NOT be used in the 'passage' or any other text field for any other question number. Its presence in other questions is a failure.
8.  **Starred Vocabulary Rule (*, **, ***):**
    - For any question with a vocabulary list at the bottom of the passage marked with asterisks (e.g., "* perplexed: ..."), you MUST extract only the vocabulary definitions.
    - Place this text into the 'starredVocabulary' field as a single string, with each definition on a new line.
    - **CRITICAL:** Do NOT include the asterisks (*, **, ***) in the string. The application adds them programmatically.
    - **CRITICAL:** This entire vocabulary block (including stars) MUST be removed from the 'passage' and 'mainTextAfterBox' fields to prevent duplication.
    - **Example:** If the passage has "* perplexed: 당혹한", the 'starredVocabulary' field should be "perplexed: 당혹한".
    - If no such list exists, this field MUST be \`null\`.

**IMPORTANT Rule for Choices:**
- When populating the \`choices\` array for ANY question, the \`text\` field for each choice object MUST contain ONLY the text of the option.
- **DO NOT** include the leading number marker (e.g., "①", "②", "③"). The application's user interface will add these markers automatically.
- Correct example: \`{ "text": "The importance of teamwork" }\`
- Incorrect example: \`{ "text": "① The importance of teamwork" }\`

**Question-Specific Formatting Rules:**

- **Questions 18-24, 26 (Purpose, Mood, Claim, etc.):**
  - The instructional sentence (e.g., "다음 글의 목적으로 가장 적절한 것은?") MUST go into the 'prompt' field.
  - The main body of text that follows the instruction MUST go into the 'passage' field. The 'passage' field MUST NOT be null for these questions.

- **Question 21:**
  - The prompt contains a Korean part and an English part. The English part that is the subject of the question MUST be extracted into the 'promptEnglishPart' field for underlining in the prompt.
  - The same English text MUST also be populated in the 'underlinedText' field. This text appears within the 'passage' and must be underlined there.

- **Questions 31-34 (Blank-filling):**
  - The prompt (e.g., "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.") MUST go ONLY into the 'prompt' field. It MUST NOT contain any part of the passage, especially not the sentence with the blank.
  - The entire passage containing the blank MUST go ONLY into the 'passage' field. When representing the blank, use a moderately sized underscore line (e.g., \`________\`) to avoid creating large word gaps when justified.
  - The 'mainTextAfterBox' field MUST be \`null\`. Do NOT duplicate the passage content.
  - **Translation:** The translation MUST be a complete Korean text with the correct answer filling the blank. The translated part corresponding to the answer MUST be wrapped in \`__ANSWER__\` markers. Be extremely precise: only underline the core translated phrase, NOT any surrounding Korean particles (e.g., 은/는, 이/가, 을/를). For example, if the answer is "new discovery" and the translation is "새로운 발견은", the correct output is "__ANSWER__새로운 발견__ANSWER__은". Incorrect: "__ANSWER__새로운 발견은__ANSWER__".

- **Questions 29, 30 (Grammar/Wording):**
  - **Absolute Precision Required:** Your analysis for these questions must be flawless. The underline must be placed on the exact word or grammatical phrase being tested, as shown in the source PDF. Misplacing the underline is a failure.
  - **Identification Rule:** In the 'passage' field, find the locations corresponding to the five choices. At each location, you MUST insert the choice marker (e.g., ①) and then wrap ONLY the grammatically relevant word OR PHRASE in \`__U__\` markers.
  - It is mandatory that all five locations are identified and marked correctly.
  - This is critical for handling phrases like "preposition + relative pronoun" where both words must be underlined together.
  - **Correct Example (Single Word):** "... is a process ① __U__referred__U__ to as..."
  - **Correct Example (Phrase):** "... the person ④ __U__for whom__U__ it was intended."
  - **Correct Example (Verb Form):** "... began to ② __U__wonder__U__ if..."
  - **INCORRECT Example (Over-underlining):** "... began to __U__to wonder__U__ if..." (Incorrect because 'to' is part of the infinitive but not the word being tested for choice).
  - The 'choices' field MUST be \`null\`.
  - **Correction Rule:** You MUST populate the \`grammarCorrection\` field. This field must contain a string showing the incorrect text from the passage and the corrected version. Use the format "① [incorrect word] → [correct word]". For example, if the answer is ① and the incorrect word is "referred", the output should be "① referred → referring". **CRITICAL: You MUST extract the exact correct word/phrase from the provided solution sheet if one was uploaded. NEVER guess the correction if the solution text tells you exactly what the answer is changed to.**

- **Question 35 (Flow / Irrelevant Sentence):**
  - **ABSOLUTELY CRITICAL RULE for the \`passage\` field:** You MUST return the complete, original passage text from the exam paper. This text INCLUDES the irrelevant sentence that is the correct answer. DO NOT remove, summarize, or alter any part of the original passage. Your ONLY task is to find the five number markers (①, ②, ③, ④, ⑤) in the text and replace them with the placeholders \`__S1__\`, \`__S2__\`, \`__S3__\`, \`__S4__\`, and \`__S5__\`, respectively. Ensure you REPLACE the original markers, do not just add the placeholders next to them. Failure to return the full, original passage with all its sentences is a critical error.
  - **\`translation\` field:** The translation MUST contain the complete Korean translation of the passage, INCLUDING the irrelevant sentence. The irrelevant sentence (the answer, based on the answer key) MUST be wrapped in \`__ANSWER__\` markers. The output must be a single, clean paragraph.
  - **\`choices\` and \`boxedText\` fields:** These fields MUST be \`null\`.

- **Questions 38, 39 (Insertion):**
  - The initial sentence/paragraph (often in a box) MUST be extracted into the 'boxedText' field.
  - The main passage with insertion points (e.g., (①), (②)) MUST go into the 'passage' field. These numbered markers MUST be included in the text EXACTLY as they appear in the source.
  - The 'choices' field MUST be \`null\`.
  - **Translation:** For the 'translation' field, provide a SINGLE, complete Korean paragraph. This paragraph MUST be the translation of the main passage with the boxed sentence correctly inserted. The final translated paragraph MUST NOT contain any of the numbered insertion markers like (①), (②), etc. The translated sentence corresponding to the 'boxedText' MUST be wrapped in \`__ANSWER__\` markers for underlining. For absolute clarity: find the Korean translation of the sentence from the 'boxedText' and place \`__ANSWER__\` markers around that specific translated sentence inside the final, merged paragraph. The rest of the translated paragraph must NOT have these markers.

- **Question 36, 37 (Sequencing):**
  - The initial sentence/paragraph MUST be extracted into the 'boxedText' field.
  - The text sections marked (A), (B), and (C) should be a single string in the 'mainTextAfterBox' field.
  - Each choice option (e.g., ①, ②) must follow the format '(A) - (C) - (B)'. Populate the 'choices' array accordingly.
  - **Translation:** Provide a complete Korean translation of the initial 'boxedText' followed by the translations of paragraphs (A), (B), and (C) presented in the correct order based on the answer. The markers (A), (B), and (C) MUST be included in the final translated text to clearly show the correct sequence.

- **Question 40 (Summary):**
  - The main passage before the summary box goes into the 'passage' field.
  - The summary sentence (e.g., "다음 글의 내용을 한 문장으로 요약하고자 한다...") goes ONLY into 'summaryPrompt'. Do NOT include it in the main 'prompt' field.
  - The summary text itself, with markers (A) and (B), goes into 'summaryBoxText'. **Crucially, do NOT include any visual underscore characters (\`_\`) in this text; use only the (A) and (B) markers.**
  - Choices text must contain both parts for (A) and (B), separated by '.....' or whitespace. Example: "active ..... passive". **CRITICAL: You MUST provide the actual words for both (A) and (B). Do NOT return dots, underscores, or placeholders instead of the words. Do NOT include markers like (A) or (B) inside the choice text. Every choice MUST have exactly two words/phrases.**
  - **Translation:** The 'translation' MUST consist of ONLY two parts: the Korean translation of the main passage, followed by a newline character ('\\n'), and then the completed Korean summary sentence. It is MANDATORY that you DO NOT translate the 'summaryPrompt'. The completed summary must have the correct answers for (A) and (B) filled in, and the translated words for (A) and (B) MUST be individually wrapped in \`__ANSWER__\` markers. **Under NO circumstances should any part of the main passage's translation be wrapped in \`__ANSWER__\` markers. This is a critical instruction.**

- **Question 41-42 (Combined Long Passage):**
  - The \`questionNumber\` field MUST be "41-42".
  - The shared long passage MUST go into the \`passage\` field.
  - The \`subQuestions\` field MUST contain an array of two objects, one for question 41 and one for question 42.
  - **CRITICAL Translation Rule:** The 'translation' field MUST be a complete Korean translation of the entire passage. It is MANDATORY to use the provided answer for question 42 to produce the final translation. Find the incorrect word (e.g., the word corresponding to choice ③) and translate it using the **CORRECT** contextual meaning, NOT the incorrect one from the passage. You MUST find the Korean words/phrases that correspond to all five underlined English words marked (a) through (e) and wrap each of these five Korean translations with \`__ANSWER__\` markers for underlining. **After the translation, you MUST add a new line and then specify the correction for the incorrect word from question 42. Use the format: \`\\n(c) decrease → increase\`**.
  - **For sub-question 41:**
    - \`questionNumber\`: "41"
    - \`prompt\`: The prompt for question 41 (e.g., "윗글의 제목으로 가장 적절한 것은?").
    - \`choices\`: The five multiple-choice options for question 41.
    - \`answer\`: The correct answer number (e.g., "①") for question 41.
  - **For sub-question 42:**
    - \`questionNumber\`: "42"
    - \`prompt\`: The prompt for question 42 (e.g., "밑줄 친 (a)~(e) 중에서 문맥상 낱말의 쓰임이 적절하지 않은 것은?").
    - \`choices\`: The five multiple-choice options for question 42.
    - \`answer\`: The correct answer number (e.g., "③") for question 42.
  - The top-level \`prompt\`, \`choices\`, and \`answer\` fields for the "41-42" object MUST be \`null\`.
`;

export const geminiSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            questionNumber: { type: Type.STRING },
            prompt: { type: Type.STRING, nullable: true },
            passage: { type: Type.STRING, nullable: true },
            choices: {
                type: Type.ARRAY,
                nullable: true,
                items: {
                    type: Type.OBJECT,
                    properties: { text: { type: Type.STRING } },
                    required: ['text'],
                }
            },
            answer: { type: Type.STRING, nullable: true },
            translation: { type: Type.STRING },
            vocabulary: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        word: { type: Type.STRING },
                        meaning: { type: Type.STRING }
                    },
                    required: ['word', 'meaning'],
                }
            },
            promptEnglishPart: { type: Type.STRING, nullable: true },
            starredVocabulary: { type: Type.STRING, nullable: true },
            underlinedText: { type: Type.STRING, nullable: true },
            boxedText: { type: Type.STRING, nullable: true },
            mainTextAfterBox: { type: Type.STRING, nullable: true },
            summaryPrompt: { type: Type.STRING, nullable: true },
            summaryBoxText: { type: Type.STRING, nullable: true },
            grammarCorrection: { type: Type.STRING, nullable: true },
            subQuestions: {
                type: Type.ARRAY,
                nullable: true,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        questionNumber: { type: Type.STRING },
                        prompt: { type: Type.STRING },
                        choices: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: { text: { type: Type.STRING } },
                                required: ['text']
                            }
                        },
                        answer: { type: Type.STRING }
                    },
                    required: ['questionNumber', 'prompt', 'choices', 'answer']
                }
            },
        },
        required: ['questionNumber', 'translation', 'vocabulary'],
    }
};

export const pdfToMarkdownPrompt = `You are a high-fidelity Document Parser. Your goal is to transcribe the English Exam PDF and its optional Answer Key/Solutions PDF into a clean, well-structured, standard Markdown (.md) document of the highest quality.

Follow these strict rules:
1. Maintain visual structure: Transcribe all text (English passages, prompts, choices, boxes, questions) exactly as they appear in the source PDF.
2. Structure with Clear Headers: Use Markdown headings (e.g. "# [Title]", "## [Question Number]") so that questions are clearly delineated.
3. Boxed Text: Utilize blockquotes (e.g. "> ...") or Markdown boxes for any boxed questions or passages.
4. Starred Vocabulary: Include any vocabulary footnotes at the bottom of the passages.
5. If a Solution sheet or Answer Keys are present in the second part or second PDF, append them clearly at the bottom under a bold heading: "## 정답 및 해설" (Correct Answers & Explanations).
6. Do NOT summarize, skip, or omit anything. Do NOT add conversational text or wrap the output in triple backticks (\`\`\`). The output should be raw Markdown text. Start directly with the transcribed contents.
`;
