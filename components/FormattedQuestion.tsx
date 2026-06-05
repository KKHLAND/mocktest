import React from 'react';
import { QuestionData } from '../types';

interface FormattedQuestionProps {
  data: QuestionData;
}

const FormattedQuestion: React.FC<FormattedQuestionProps> = ({ data }) => {
  const renderPrompt = () => {
    if (!data.prompt) return null;
    let content: React.ReactNode[] = [data.prompt];

    if (data.questionNumber === '21' && data.promptEnglishPart) {
      content = content.flatMap(segment =>
        typeof segment === 'string' && segment.includes(data.promptEnglishPart!)
          ? segment.split(data.promptEnglishPart!).flatMap((part, i, arr) =>
            i < arr.length - 1 ? [part, <span className="custom-underline" key={`en-${i}`}>{data.promptEnglishPart}</span>] : [part]
          )
          : [segment]
      );
    }

    const keywords = ['틀린', '않는', '없는'];
    keywords.forEach(keyword => {
      content = content.flatMap(segment =>
        typeof segment === 'string' && segment.includes(keyword)
          ? segment.split(keyword).flatMap((part, i, arr) =>
            i < arr.length - 1 ? [part, <span className="custom-underline" key={`${keyword}-${i}`}>{keyword}</span>] : [part]
          )
          : [segment]
      );
    });

    return <p className="question-prompt">{content}</p>;
  };

  const renderPassage = () => {
    if (!data.passage) return null;

    let passageContent: any = data.passage;

    if (data.questionNumber !== '29' && data.questionNumber !== '30' && typeof passageContent === 'string') {
      passageContent = passageContent.replace(/__U__/g, '');
    }

    if (data.starredVocabulary && typeof passageContent === 'string') {
      passageContent = passageContent.replace(data.starredVocabulary, '').trim();
    }

    if (['31', '32', '33', '34'].includes(data.questionNumber) && typeof passageContent === 'string') {
      const blankRegex = /(_{5,})/;
      if (blankRegex.test(passageContent)) {
        const answerIndex = ['①', '②', '③', '④', '⑤'].indexOf(data.answer || '');
        if (data.choices && answerIndex > -1 && data.choices[answerIndex]) {
          const answerText = data.choices[answerIndex]!.text;
          const blankSpan = <span className="answer-blank" key="blank"><span className="answer-blank-text">{answerText}</span></span>;
          const parts = passageContent.split(blankRegex);
          passageContent = <>{parts.map((part, i) => (part.match(blankRegex) ? blankSpan : part))}</>;
        }
      }
    }
    else if ((data.questionNumber === '29' || data.questionNumber === '30') && typeof passageContent === 'string') {
      const regex = /((?:①|②|③|④|⑤)\s*__U__.*?__U__)/g;
      const parts = passageContent.split(regex);
      const subRegex = /(①|②|③|④|⑤)\s*__U__(.*?)__U__/;

      passageContent = (
        <>
          {parts.map((part, index) => {
            const match = part.match(subRegex);
            if (match) {
              const marker = match[1];
              const textToUnderline = match[2];
              return (
                <React.Fragment key={index}>
                  {marker} <span className="custom-underline">{textToUnderline}</span>
                </React.Fragment>
              );
            }
            return part;
          })}
        </>
      );
    }
    else if (data.questionNumber === '35' && typeof passageContent === 'string') {
      const cleanedPassage = passageContent.replace(/[①②③④⑤]\s*(__S[1-5]__)/g, '$1');
      const parts = cleanedPassage.split(/(__S[1-5]__)/g);
      const markers = ['①', '②', '③', '④', '⑤'];
      passageContent = (
        <>
          {parts.map((part, index) => {
            const match = part.match(/__S(\d)__/);
            if (match) {
              const digit = parseInt(match[1], 10);
              if (digit >= 1 && digit <= 5) {
                return <React.Fragment key={index}>{markers[digit - 1]}</React.Fragment>;
              }
            }
            return part;
          })}
        </>
      );
    }
    else if (data.questionNumber === '41-42' && typeof passageContent === 'string') {
      const regex = /(\([a-e]\)\s+)(\S+)/g;
      const parts = passageContent.split(regex);
      passageContent = (
        <>
          {parts.map((part, index) => {
            if (index > 0 && index % 3 === 2) {
              return <span className="custom-underline" key={index}>{part}</span>;
            }
            return part;
          })}
        </>
      );
    }
    else if (data.underlinedText && typeof passageContent === 'string') {
      const cleanUnderlinedText = data.underlinedText.replace(/<\/?u>/g, '');

      if (passageContent.includes(cleanUnderlinedText)) {
        const parts = passageContent.split(cleanUnderlinedText);
        let firstPart = parts[0];

        if (data.questionNumber === '21') {
          firstPart = firstPart.replace(/underlinedText\s*:?\s*$/, '');
        }
        passageContent = (
          <>
            {firstPart}<span className="custom-underline">{cleanUnderlinedText}</span>{parts.slice(1).join(cleanUnderlinedText)}
          </>
        );
      }
    }

    return <div className="question-passage">{passageContent}</div>;
  };

  const renderStarredVocabulary = () => {
    if (!data.starredVocabulary) return null;
    const vocabWithStars = data.starredVocabulary
      .split('\n')
      .filter(line => line.trim() !== '' && line.trim().toLowerCase() !== 'null')
      .map((line, index) => `${'*'.repeat(index + 1)} ${line.trim()}`)
      .join('\n');
    if (!vocabWithStars) return null;
    return <pre className="starred-vocabulary">{vocabWithStars}</pre>;
  };

  const renderMainTextAfterBox = () => {
    if (!data.mainTextAfterBox || ['31', '32', '33', '34'].includes(data.questionNumber)) return null;

    let text = data.mainTextAfterBox;
    if (data.starredVocabulary) {
      text = text.replace(data.starredVocabulary, '').trim();
    }

    if (data.questionNumber === '36' || data.questionNumber === '37') {
      const parts = text.split(/(\([A-C]\))/).filter(part => part.trim() !== '');
      const paragraphs = [];
      for (let i = 0; i < parts.length; i += 2) {
        if (parts[i + 1]) {
          paragraphs.push(
            <p key={i} className="sequence-paragraph">
              {parts[i]}{parts[i + 1]}
            </p>
          );
        } else {
          paragraphs.push(<p key={i} className="sequence-paragraph">{parts[i]}</p>);
        }
      }
      return <div className="question-after-box">{paragraphs}</div>;
    }

    return <div className="question-after-box">{text}</div>;
  };

  const renderChoices = () => {
    if (!data.choices || data.choices.length === 0) {
      return null;
    }
    const choiceMarkers = ['①', '②', '③', '④', '⑤'];

    const choicesClassName = `question-choices ${
      (data.questionNumber === '36' || data.questionNumber === '37') ? 'choices-layout-36-37' : ''
    }`;

    return (
      <>
        {data.questionNumber === '40' && (
          <div className="choice-header-40">
            <span>(A)</span>
            <span>(B)</span>
          </div>
        )}
        <ul className={choicesClassName}>
          {data.choices.map((choice, index) => {
            if (!choice) return null;
            if (data.questionNumber === '40') {
              const text = choice.text || '';
              // Clean up dots, (A)/(B) markers, and split by whitespace to extract only the words
              const cleanParts = text
                .replace(/\.{2,}/g, ' ') // Replace dot groups with space
                .replace(/\((A|B)\)/g, ' ') // Replace (A) or (B) with space
                .split(/\s+/)            // Split by any whitespace
                .filter(p => p && !p.match(/^\.+$/)); // Filter empty and dots-only strings
              
              const partA = cleanParts[0] || '';
              const partB = cleanParts[1] || '';
              return (
                <li key={index} className="choice-item-40">
                  <span className="choice-marker">{choiceMarkers[index]}</span>
                  <span className="choice-part-a">{partA}</span>
                  <span className="choice-dots">......</span>
                  <span className="choice-part-b">{partB}</span>
                </li>
              );
            }
            return (
              <li key={index}>
                <span className="choice-marker">{choiceMarkers[index]}</span>
                <span className="choice-text">{choice.text}</span>
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  const containerClasses = ['question-text-container'];
  if (data.questionNumber === '41-42') {
    containerClasses.push('question-text-container-41-42');
  }
  if (data.questionNumber === '40') {
    containerClasses.push('question-text-container-40');
  }

  if (data.subQuestions && data.subQuestions.length > 0) {
    return (
      <div className={containerClasses.join(' ')}>
        {renderPassage()}
        <div className="starred-vocabulary-container">{renderStarredVocabulary()}</div>
        <div className="sub-questions-container">
          {data.subQuestions.map((subQ) => (
            <div key={subQ.questionNumber} className="sub-question">
              <p className="question-prompt">{subQ.questionNumber}. {subQ.prompt}</p>
              <ul className={`question-choices ${subQ.questionNumber === '42' ? 'choices-horizontal' : ''}`}>
                {subQ.choices.map((choice, choiceIdx) => (
                  <li key={choiceIdx}>
                    <span className="choice-marker">{'①②③④⑤'[choiceIdx]}</span>
                    <span className="choice-text">{choice.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses.join(' ')}>
      {renderPrompt()}
      {data.boxedText && <div className="boxed-text">{data.boxedText}</div>}

      {['36', '37'].includes(data.questionNumber) ? (
        <>
          {renderPassage()}
          {renderMainTextAfterBox()}
          <div className="starred-vocabulary-container">{renderStarredVocabulary()}</div>
        </>
      ) : (
        <>
          {renderPassage()}
          <div className="starred-vocabulary-container">{renderStarredVocabulary()}</div>
          {renderMainTextAfterBox()}
        </>
      )}

      {data.questionNumber === '40' && data.summaryBoxText && <div className="summary-arrow">↓</div>}
      {data.summaryBoxText && (
        <div className="boxed-text summary-box">
          {data.summaryBoxText.split(/(\(A\)|\(B\))/g).map((part, index) => {
            if (part === '(A)' || part === '(B)') {
              return <span className="summary-blank" key={index}>{part}</span>;
            }
            return part;
          })}
        </div>
      )}
      {renderChoices()}
    </div>
  );
};

export default FormattedQuestion;