import React, { useState, useRef, useEffect } from 'react';
import { QuestionData } from '../types';
import FormattedQuestion from './FormattedQuestion';

interface AnalysisSheetProps {
  title: string;
  questionData: QuestionData;
  logoDataUrl: string | null;
}

const AnalysisSheet: React.FC<AnalysisSheetProps> = ({ title, questionData, logoDataUrl }) => {
  const displayTitle = title.replace('문제지', '해설지');
  const [visibleVocabCount, setVisibleVocabCount] = useState<number | null>(null);
  const vocabBlockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleVocabCount(null);
  }, [questionData]);

  useEffect(() => {
    if (visibleVocabCount === null) {
      const calculateVisibleItems = () => {
        if (!vocabBlockRef.current) return;

        const container = vocabBlockRef.current;
        const heading = container.querySelector('h4');
        const list = container.querySelector('ul');
        const firstItem = list?.querySelector('li');

        if (!heading || !list || !firstItem) {
          setVisibleVocabCount(questionData.vocabulary.length);
          return;
        }

        const containerHeight = container.clientHeight;

        const headingStyle = window.getComputedStyle(heading);
        const headingMarginBottom = parseInt(headingStyle.marginBottom, 10);
        const headingPaddingTop = parseInt(headingStyle.paddingTop, 10);
        const headingTotalHeight = (heading as HTMLElement).offsetHeight + headingMarginBottom + headingPaddingTop;

        const itemStyle = window.getComputedStyle(firstItem);
        const itemMarginTop = parseInt(itemStyle.marginTop, 10);
        const itemMarginBottom = parseInt(itemStyle.marginBottom, 10);
        const itemTotalHeight = (firstItem as HTMLElement).offsetHeight + itemMarginTop + itemMarginBottom;

        if (itemTotalHeight > 0) {
          const availableListHeight = containerHeight - headingTotalHeight;
          const safetyMargin = 48;
          const maxItems = Math.floor((availableListHeight - safetyMargin) / itemTotalHeight);
          const finalCount = Math.max(0, maxItems);
          setVisibleVocabCount(finalCount);
        } else {
          setVisibleVocabCount(questionData.vocabulary.length);
        }
      };
      
      const timerId = setTimeout(calculateVisibleItems, 150);
      return () => clearTimeout(timerId);
    }
  }, [visibleVocabCount, questionData.vocabulary]);

  const renderMarkdownFreeText = (text: string | null) => {
    if (!text) return null;
    const parts = text.split(/__U__(.*?)__U__/g);
    if (parts.length === 1) {
      return text.replace(/__U__/g, '').replace(/__B__/g, '').replace(/__I__/g, '');
    }
    return (
      <>
        {parts.map((part, index) => {
          const cleanedPart = part.replace(/__U__/g, '').replace(/__B__/g, '').replace(/__I__/g, '');
          if (index % 2 === 1) {
            return <span className="custom-underline" key={index}>{cleanedPart}</span>;
          }
          return cleanedPart;
        })}
      </>
    );
  };

  const renderTranslation = () => {
    let { translation, questionNumber } = questionData;
    if (!translation) return null;

    // Strip out __S1__, __S2__, etc. from the translation so they do not show up
    translation = translation.replace(/__S\d+__/g, '').replace(/  +/g, ' ').trim();

    const allowedUnderlineQuestions = ['31', '32', '33', '34', '38', '39', '40', '41-42'];

    if (questionNumber === '35') {
      if (translation.includes('__ANSWER__')) {
        const parts = translation.split(/__ANSWER__(.*?)__ANSWER__/);
        return (
          <>
            {parts.map((part, index) => {
              if (index % 2 === 1) {
                return <span className="irrelevant-sentence" key={index}>{renderMarkdownFreeText(part)}</span>;
              }
              return renderMarkdownFreeText(part);
            })}
          </>
        );
      }
      return renderMarkdownFreeText(translation);
    }

    if (questionNumber === '36' || questionNumber === '37') {
      const parts = translation.split(/(\([A-C]\))/);
      return (
        <div className="translation-container">
          {parts.map((part, index) => {
            if (part.match(/\([A-C]\)/)) {
              return null; // We'll handle it in the next part
            }
            const prevPart = parts[index - 1];
            if (prevPart && prevPart.match(/\([A-C]\)/)) {
              return (
                <div key={index} className="hanging-indent">
                  <span className="marker">{prevPart}</span>
                  <span className="text">{renderMarkdownFreeText(part)}</span>
                </div>
              );
            }
            return part.trim() ? <div key={index} className="translation-paragraph">{renderMarkdownFreeText(part)}</div> : null;
          })}
        </div>
      );
    }

    if (allowedUnderlineQuestions.includes(questionNumber)) {
      if (translation.includes('__ANSWER__')) {
        const parts = translation.split(/__ANSWER__(.*?)__ANSWER__/);
        return (
          <>
            {parts.map((part, index) => {
              if (index % 2 === 1) {
                return <span className="custom-underline" key={index}>{renderMarkdownFreeText(part)}</span>;
              }
              return renderMarkdownFreeText(part);
            })}
          </>
        );
      }
      return renderMarkdownFreeText(translation);
    } else {
      return renderMarkdownFreeText(translation.replace(/__ANSWER__/g, ''));
    }
  };
  
  const vocabsToDisplay = visibleVocabCount === null 
    ? questionData.vocabulary 
    : questionData.vocabulary.slice(0, visibleVocabCount);

  const isLongQuestion = questionData.questionNumber === '41-42' || 
                         (questionData.passage && questionData.passage.length > 650) ||
                         (questionData.translation && questionData.translation.length > 500);

  return (
    <div className={`analysis-sheet ${isLongQuestion ? 'is-long-question' : ''}`}>
      <div className="preview-header">
        <span className="title">{displayTitle}</span>
        <span className="info">학번 ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ) 이름 ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</span>
      </div>
      <div className="preview-body">
        <div className="question-main-content">
          <div className="question-content">
            <h2 className="question-number">{questionData.questionNumber.replace('-', '~')}</h2>
            <FormattedQuestion data={questionData} />
          </div>
        </div>
        <div className="analysis-content">
          <h3>해석</h3>
          <div className="explanation-block">{renderTranslation()}</div>

          {(questionData.questionNumber === '29' || questionData.questionNumber === '30') && questionData.grammarCorrection && (
            <p className="grammar-correction">{questionData.grammarCorrection}</p>
          )}

          {questionData.subQuestions && questionData.subQuestions.length > 0 ? (
            <div className="answer-group">
              {questionData.subQuestions.map(subQ => (
                <p key={subQ.questionNumber} className="answer-text">
                  {subQ.questionNumber}번 정답: {subQ.answer}
                </p>
              ))}
            </div>
          ) : (
            <p className="answer-text">정답: {questionData.answer}</p>
          )}
          <div className="vocabulary-block" ref={vocabBlockRef}>
            <h4>어휘 및 어구</h4>
            <ul>
              {vocabsToDisplay.map((item, index) => (
                <li key={index}>{item.word} - {item.meaning}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="preview-footer">
        {logoDataUrl && <img src={logoDataUrl} alt="logo" className="logo-placeholder" />}
      </div>
    </div>
  );
};

export default AnalysisSheet;