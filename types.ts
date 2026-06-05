export interface Choice {
  text: string;
}

export interface VocabularyItem {
  word: string;
  meaning: string;
}

export interface SubQuestion {
  questionNumber: string;
  prompt: string;
  choices: Choice[];
  answer: string;
}

export interface QuestionData {
  questionNumber: string;
  prompt?: string;
  promptEnglishPart?: string;
  passage?: string;
  choices?: (Choice | null)[];
  answer?: string;
  translation: string;
  vocabulary: VocabularyItem[];
  starredVocabulary?: string;
  underlinedText?: string;
  boxedText?: string;
  mainTextAfterBox?: string;
  summaryPrompt?: string;
  summaryBoxText?: string;
  grammarCorrection?: string;
  subQuestions?: SubQuestion[];
}

export type AnalysisDataMap = Record<string, QuestionData>;