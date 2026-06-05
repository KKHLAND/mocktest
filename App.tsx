import React, { useState, useRef, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { AnalysisDataMap } from './types';
import DropZone from './components/DropZone';
import AnalysisSheet from './components/AnalysisSheet';
import { geminiPrompt, geminiSchema } from './services/geminiService';
import { encryptKey, decryptKey } from './utils/crypto';

const ALLOWED_QUESTIONS = ['18', '19', '20', '21', '22', '23', '24', '26', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41-42'];

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });

function sanitizeAIResponse(data: any) {
    if (!data || typeof data !== 'object') return {};

    Object.values(data).forEach((question: any) => {
        if (!question || typeof question !== 'object') return;

        const stringKeys = [
            'questionNumber', 'prompt', 'promptEnglishPart', 'passage',
            'starredVocabulary', 'underlinedText', 'boxedText',
            'mainTextAfterBox', 'summaryPrompt', 'summaryBoxText', 'answer', 'translation',
            'grammarCorrection'
        ];

        stringKeys.forEach(key => {
            const value = question[key];
            if (value !== undefined && value !== null && typeof value !== 'string') {
                question[key] = JSON.stringify(value, null, 2);
            }
        });

        if (Array.isArray(question.choices)) {
            question.choices = question.choices.filter(Boolean);
            question.choices.forEach((choice: any) => {
                if (choice && typeof choice.text !== 'string') {
                    choice.text = JSON.stringify(choice.text, null, 2);
                }
            });
        } else if (question.choices !== undefined && question.choices !== null) {
            question.choices = [];
        }

        if (Array.isArray(question.vocabulary)) {
            question.vocabulary = question.vocabulary.filter(Boolean);
            question.vocabulary.forEach((item: any) => {
                if (item) {
                    if (typeof item.word !== 'string') {
                        item.word = String(item.word);
                    }
                    if (typeof item.meaning !== 'string') {
                        item.meaning = String(item.meaning);
                    }
                }
            });
        } else if (question.vocabulary) {
            question.vocabulary = [];
        }

        if (Array.isArray(question.subQuestions)) {
            question.subQuestions = question.subQuestions.filter(Boolean);
            question.subQuestions.forEach((subQ: any) => {
                if (subQ) {
                    if (typeof subQ.questionNumber !== 'string') {
                        subQ.questionNumber = String(subQ.questionNumber);
                    }
                    if (typeof subQ.prompt !== 'string') {
                        subQ.prompt = String(subQ.prompt);
                    }
                    if (typeof subQ.answer !== 'string') {
                        subQ.answer = String(subQ.answer);
                    }
                    if (Array.isArray(subQ.choices)) {
                        subQ.choices = subQ.choices.filter(Boolean);
                        subQ.choices.forEach((choice: any) => {
                            if (choice && typeof choice.text !== 'string') {
                                choice.text = JSON.stringify(choice.text, null, 2);
                            }
                        });
                    } else if (subQ.choices) {
                        subQ.choices = [];
                    }
                }
            });
        } else if (question.subQuestions) {
            question.subQuestions = [];
        }
    });

    return data;
}

const App = () => {
    const [examFile, setExamFile] = useState<File | null>(null);
    const [solutionFile, setSolutionFile] = useState<File | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
    const [inputType, setInputType] = useState<'pdf' | 'md' | 'text'>('pdf');
    const [rawExamText, setRawExamText] = useState('');
    const [rawSolutionText, setRawSolutionText] = useState('');
    const [convertedMarkdown, setConvertedMarkdown] = useState('');
    const [mdFile, setMdFile] = useState<File | null>(null);
    const [activePreviewTab, setActivePreviewTab] = useState<'sheets' | 'markdown'>('sheets');
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessed, setIsProcessed] = useState(false);
    const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
    const [analysisData, setAnalysisData] = useState<AnalysisDataMap | null>(null);
    const [examTitle, setExamTitle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState('파일을 분석 중입니다... (최대 1분 소요)');
    const [pdfProgress, setPdfProgress] = useState<string | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const isCancelledRef = useRef(false);

    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [inputApiKey, setInputApiKey] = useState('');
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        const encryptedKey = localStorage.getItem("gemini_api_key_encrypted");
        if (encryptedKey) {
            try {
                setInputApiKey(decryptKey(encryptedKey));
            } catch (e) {
                console.error("Failed to decrypt initial key:", e);
            }
        }
    }, []);

    useEffect(() => {
        if (!logoFile) {
            setLogoDataUrl(null);
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setLogoDataUrl(reader.result as string);
        };
        reader.readAsDataURL(logoFile);
    }, [logoFile]);

    const convertPDFToMarkdownText = async (exam: File, solution: File | null): Promise<string> => {
        const encryptedKey = localStorage.getItem("gemini_api_key_encrypted");
        if (!encryptedKey) {
            setError("PDF 변환을 위해 Gemini API 키 설정이 필요합니다. 상단의 'API 키 확인 및 설정' 버튼을 눌러 API 키를 등록해 주세요.");
            setIsApiKeyModalOpen(true);
            throw new Error("Gemini API key is required.");
        }
        const plainApiKey = decryptKey(encryptedKey);
        if (!plainApiKey) {
            setError("등록된 API 키를 해독하지 못했습니다. 다시 설정해 주시기 바랍니다.");
            setIsApiKeyModalOpen(true);
            throw new Error("Decrypting Gemini API key failed.");
        }

        setLoadingMessage('1단계: PDF에서 문항을 추출하여 Markdown으로 변환 중... (최대 1분 소요)');
        const examBase64 = await fileToBase64(exam);
        const solBase64 = solution ? await fileToBase64(solution) : null;

        const response = await fetch("/api/convert-pdf-to-md", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": plainApiKey
            },
            body: JSON.stringify({
                examFileBase64: examBase64,
                examFileMime: exam.type,
                solutionFileBase64: solBase64,
                solutionFileMime: solution ? solution.type : undefined,
                model: 'gemini-3.5-flash',
                apiKey: plainApiKey
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `PDF 변환 중 에러가 발생했습니다 (상태: ${response.status})`);
        }

        const data = await response.json();
        if (!data.markdown) {
            throw new Error("PDF에서 Markdown 변환 결과를 받지 못했습니다.");
        }
        return data.markdown;
    };

    const handleManualConvertPDF = async () => {
        if (!examFile) {
            setError("시험지 파일을 선택해주세요.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setConvertedMarkdown('');
        isCancelledRef.current = false;
        setExamTitle(examFile.name.replace(/\.[^/.]+$/, ""));

        try {
            const md = await convertPDFToMarkdownText(examFile, solutionFile);
            const prefixedMd = `<!-- ORIGINAL_FILENAME: ${examFile.name.replace(/\.[^/.]+$/, "")} -->\n${md}`;
            setConvertedMarkdown(prefixedMd);
            setActivePreviewTab('markdown');
            setIsProcessed(false);
        } catch (err: any) {
            console.error(err);
            setError(`PDF 변환 중 오류가 발생했습니다. 오류 상세: ${err.message || 'Unknown Error'}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('파일을 분석 중입니다... (최대 1분 소요)');
        }
    };

    const downloadMarkdownFile = () => {
        if (!convertedMarkdown) return;
        const blob = new Blob([convertedMarkdown], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${examTitle || 'exam_converted'}.md`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const generateAnalysis = async () => {
        const encryptedKey = localStorage.getItem("gemini_api_key_encrypted");
        if (!encryptedKey) {
            setError("해설지를 생성하기 위해 Gemini API 키 설정이 필요합니다. 상단의 'API 키 확인 및 설정' 버튼을 눌러 API 키를 등록해 주세요.");
            setIsApiKeyModalOpen(true);
            return;
        }
        const plainApiKey = decryptKey(encryptedKey);
        if (!plainApiKey) {
            setError("등록된 API 키를 해독하지 못했습니다. 다시 설정해 주시기 바랍니다.");
            setIsApiKeyModalOpen(true);
            return;
        }

        if (inputType === 'pdf' && !examFile) {
            setError("시험지 파일을 선택해주세요.");
            return;
        }
        if (inputType === 'md' && !convertedMarkdown.trim()) {
            setError("Markdown 대상을 업로드하거나 텍스트를 입력해주세요.");
            return;
        }
        if (inputType === 'text' && !rawExamText.trim()) {
            setError("시험지 텍스트를 입력해주세요.");
            return;
        }

        setIsLoading(true);
        setIsProcessed(false);
        setError(null);
        setAnalysisData({});
        isCancelledRef.current = false;

        let title = "분석해설지";
        if (inputType === 'pdf' && examFile) {
            title = examFile.name.replace(/\.[^/.]+$/, "");
        } else if (inputType === 'md') {
            const metadataMatch = convertedMarkdown.match(/<!--\s*ORIGINAL_FILENAME:\s*(.*?)\s*-->/);
            if (metadataMatch && metadataMatch[1]) {
                title = metadataMatch[1].trim();
            } else if (mdFile) {
                const cleanName = mdFile.name.replace(/\.[^/.]+$/, "");
                title = cleanName.replace(/_converted$/, "").replace(/-converted$/, "");
            } else {
                title = "분석해설지";
            }
        } else {
            title = "텍스트_분석해설지";
        }
        setExamTitle(title);

        try {
            let sourceText = "";

            if (inputType === 'pdf' && examFile) {
                let mdText = convertedMarkdown;
                if (!mdText) {
                    const freshMd = await convertPDFToMarkdownText(examFile, solutionFile);
                    mdText = `<!-- ORIGINAL_FILENAME: ${examFile.name.replace(/\.[^/.]+$/, "")} -->\n${freshMd}`;
                    setConvertedMarkdown(mdText);
                }
                sourceText = mdText;
            } else if (inputType === 'md') {
                sourceText = convertedMarkdown;
            }

            setLoadingMessage('2단계: AI가 문항 분석 및 해설을 생성하고 있습니다...');

            const contents: any[] = [
                {
                    parts: [
                        { text: geminiPrompt(selectedQuestions) },
                    ]
                }
            ];

            if (inputType === 'text') {
                contents[0].parts.push({
                    text: `\nHere is the raw text of the exam:\n\n${rawExamText}`
                });
                if (rawSolutionText.trim()) {
                    contents[0].parts.push({
                        text: `\nHere is the raw text of the solution sheet:\n\n${rawSolutionText}`
                    });
                }
            } else {
                contents[0].parts.push({
                    text: `\nHere is the raw text of the exam (in Markdown format):\n\n${sourceText}`
                });
            }

            const response = await fetch("/api/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": plainApiKey
                },
                body: JSON.stringify({
                    contents: contents[0],
                    model: 'gemini-3.5-flash',
                    apiKey: plainApiKey
                }),
            });

            if (isCancelledRef.current) return;

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `서버 에러가 발생했습니다 (상태 코드: ${response.status})`);
            }

            const data = await response.json();
            const jsonText = data.text;
            if (jsonText) {
                const parsedData = JSON.parse(jsonText);
                const dataObject = parsedData.reduce((acc: any, item: any) => {
                    acc[item.questionNumber] = item;
                    return acc;
                }, {});
                const sanitized = sanitizeAIResponse(dataObject);
                setAnalysisData(sanitized);
                setIsProcessed(true);
                // Switch back to "sheets" preview when processed successfully
                setActivePreviewTab('sheets');
            } else {
                throw new Error("AI가 유효한 데이터를 반환하지 않았습니다.");
            }

        } catch (err: any) {
            console.error(err);
            setError(`해설지 생성 중 오류가 발생했습니다. 오류 상세: ${err.message || 'Unknown Error'}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('파일을 분석 중입니다... (최대 1분 소요)');
        }
    };

    const examFileURL = useMemo(() => (examFile ? URL.createObjectURL(examFile) : null), [examFile]);

    useEffect(() => {
        return () => {
            if (examFileURL) {
                URL.revokeObjectURL(examFileURL);
            }
        };
    }, [examFileURL]);

    const handleFileDrop = (setter: (f: File) => void) => (file: File) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            setError(`${file.type}은(는) 지원하지 않는 파일 형식입니다. PDF 또는 이미지 파일을 업로드해주세요.`);
            return;
        }
        setError(null);
        setter(file);
    };

    const handleDownload = async () => {
        if (!previewRef.current || !analysisData || Object.keys(analysisData).length === 0) return;

        setPdfProgress("PDF 생성 준비 중...");
        // Ensure we are at the top of the page for clean capture
        window.scrollTo(0, 0);

        try {
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const sheets = Array.from(previewRef.current.querySelectorAll('.analysis-sheet')) as HTMLElement[];

            for (let i = 0; i < sheets.length; i++) {
                setPdfProgress(`PDF 생성 중... (${i + 1}/${sheets.length} 페이지)`);
                const sheet = sheets[i];

                const canvas = await html2canvas(sheet, {
                    scale: 2, // Reduced scale for better compatibility and memory
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    // Explicitly set dimensions to avoid capturing shadows or extra space
                    onclone: (clonedDoc) => {
                        const clonedSheet = clonedDoc.querySelector('.analysis-sheet') as HTMLElement;
                        if (clonedSheet) {
                            clonedSheet.style.boxShadow = 'none';
                            clonedSheet.style.margin = '0';
                            clonedSheet.style.zoom = '1';
                            clonedSheet.style.transform = 'none';
                        }
                    }
                });

                if (i > 0) {
                    pdf.addPage();
                }
                
                // Use a slightly smaller dimension to avoid triggering auto-page-break in some environments
                pdf.addImage(canvas, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            }

            pdf.save(`${examTitle}_해설지.pdf`);
        } catch (e: any) {
            console.error("PDF generation failed:", e);
            setError(`PDF 생성 중 오류가 발생했습니다: ${e.message}`);
        } finally {
            setPdfProgress(null);
        }
    };

    const handlePrint = () => {
        if (!previewRef.current || !analysisData || Object.keys(analysisData).length === 0) return;

        const printWindow = window.open('', '_blank', 'width=950,height=1000,scrollbars=yes');
        if (!printWindow) {
            setError("인쇄 팝업창을 열 수 없습니다. 브라우저의 팝업 차단 설정을 확인해 주시거나 팝업을 허용해 주세요.");
            return;
        }

        const styles = Array.from(document.querySelectorAll('style')).map(s => s.outerHTML).join('\n');
        const links = Array.from(document.querySelectorAll('link')).map(l => l.outerHTML).join('\n');

        const printStyles = `
            <style>
                .print-toolbar {
                    position: sticky;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: #1e293b;
                    color: white;
                    padding: 12px 24px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #334155;
                    font-family: 'Noto Sans KR', sans-serif;
                    z-index: 9999;
                    margin-bottom: 25px;
                }
                .print-toolbar-title-container {
                    display: flex;
                    flex-direction: column;
                }
                .print-toolbar-title {
                    font-size: 15px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .print-toolbar-btn {
                    background: #4f46e5;
                    color: white;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 6px;
                    font-weight: 700;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s, transform 0.1s;
                }
                .print-toolbar-btn:hover {
                    background: #4338ca;
                }
                .print-toolbar-btn:active {
                    transform: scale(0.98);
                }

                body {
                    background-color: #f1f5f9;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    min-height: 100vh;
                }
                
                #popup-preview-content {
                    display: flex;
                    flex-direction: column;
                    gap: 30px;
                    padding: 20px;
                    align-items: center;
                    width: 100%;
                    box-sizing: border-box;
                }

                .analysis-sheet {
                    box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
                    background: white !important;
                    box-sizing: border-box;
                    margin: 0 auto;
                }

                @media print {
                    html, body {
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 210mm !important;
                        height: auto !important;
                        min-height: auto !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-toolbar {
                        display: none !important;
                    }
                    #popup-preview-content {
                        padding: 0 !important;
                        margin: 0 !important;
                        gap: 0 !important;
                        display: block !important;
                        width: 210mm !important;
                    }
                    .analysis-sheet {
                        box-shadow: none !important;
                        margin: 0 !important;
                        border: none !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        max-height: 297mm !important;
                        min-height: 297mm !important;
                        box-sizing: border-box !important;
                        zoom: 1 !important;
                        transform: none !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        page-break-after: always !important;
                        break-after: page !important;
                    }
                    .analysis-sheet:last-child {
                        page-break-after: avoid !important;
                        break-after: avoid !important;
                    }
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }
                }
            </style>
        `;

        printWindow.document.write('<!DOCTYPE html>');
        printWindow.document.write('<html lang="ko">');
        printWindow.document.write('<head>');
        printWindow.document.write('<meta charset="UTF-8">');
        printWindow.document.write('<title>' + examTitle + ' - 인쇄 미리보기</title>');
        printWindow.document.write(links);
        printWindow.document.write(styles);
        printWindow.document.write(printStyles);
        printWindow.document.write('</head>');
        printWindow.document.write('<body>');

        printWindow.document.write(`
            <div class="print-toolbar">
                <div class="print-toolbar-title-container">
                    <div class="print-toolbar-title">
                        <span>🖨️</span>
                        <span>영어 모의고사 해설지 인쇄 미리보기</span>
                    </div>
                    <div class="print-toolbar-tip" style="font-size: 13px; color: #cbd5e1; font-weight: normal; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                        <span>💡</span>
                        <span><strong>[권장 인쇄설정]</strong> 인쇄 미리보기 창에서 <strong>설정 더보기 &gt; 여백: 없음</strong>, <strong>머리글과 바닥글: 체크 해제</strong>하셔야 빈 여백 없이 A4 가득 완벽하게 맞춤 인쇄됩니다.</span>
                    </div>
                </div>
                <button class="print-toolbar-btn" onclick="window.print()">지금 인쇄하기</button>
            </div>
        `);

        printWindow.document.write('<div id="popup-preview-content">');
        printWindow.document.write(previewRef.current.innerHTML);
        printWindow.document.write('</div>');

        printWindow.document.write('</body>');
        printWindow.document.write('</html>');
        printWindow.document.close();

        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
            }, 600);
        };
    };

    const sortedAnalysisData = useMemo(() => {
        if (!analysisData) return [];
        return Object.values(analysisData).sort((a, b) => {
            const numA = parseInt((a as any).questionNumber, 10);
            const numB = parseInt((b as any).questionNumber, 10);
            return numA - numB;
        });
    }, [analysisData]);

    return (
        <>
            <div className="app-wrapper">
                <header className="app-header">
                    <div className="header-badge">
                        <span className="badge-icon">A</span>
                        <span className="badge-text">AI Powered</span>
                    </div>
                    <h1>AI 영어 모의고사 해설지 생성기</h1>
                    <p>영어 모의고사 PDF를 업로드하여 문항별 맞춤 해설지를 만들어보세요.</p>
                </header>
                <div className="app-container">
                    <aside className="controls-panel">
                        {/* API KEY CHECK & SETUP BUTTON (with high-quality green 3D pressed mechanical effect) */}
                        <button
                            id="btn-api-key"
                            onClick={() => {
                                setIsApiKeyModalOpen(true);
                                setTestStatus('idle');
                                setTestMessage('');
                            }}
                            style={{
                                width: '100%',
                                backgroundColor: '#10b981', // green-500
                                color: '#ffffff',
                                fontWeight: 'bold',
                                fontSize: '0.9rem',
                                padding: '0.75rem 1rem',
                                border: 'none',
                                borderRadius: '8px',
                                borderBottom: '4px solid #047857', // green-700
                                boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2), 0 2px 4px -1px rgba(16, 185, 129, 0.1)',
                                cursor: 'pointer',
                                transition: 'all 0.1s ease-in-out',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                marginBottom: '1rem',
                            }}
                            onMouseDown={(e) => {
                                e.currentTarget.style.transform = 'translateY(2px)';
                                e.currentTarget.style.borderBottom = '1px solid #047857';
                            }}
                            onMouseUp={(e) => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.borderBottom = '4px solid #047857';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.borderBottom = '4px solid #047857';
                            }}
                        >
                            🔑 Gemini API 키 확인 및 설정
                        </button>
                        
                        <div className="input-type-selector" style={{display: 'flex', gap: '0.4rem', marginBottom: '1rem', width: '100%'}}>
                            <button 
                                className="btn-secondary" 
                                onClick={() => { setInputType('pdf'); setError(null); }} 
                                style={{
                                    flex: 1, 
                                    fontSize: '0.82rem', 
                                    padding: '0.6rem 0.2rem', 
                                    whiteSpace: 'nowrap',
                                    border: inputType === 'pdf' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                    backgroundColor: inputType === 'pdf' ? '#2563eb' : '#eff6ff', 
                                    color: inputType === 'pdf' ? 'white' : '#1d4ed8', 
                                    fontWeight: 700,
                                    borderRadius: '8px',
                                    boxShadow: inputType === 'pdf' ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none'
                                }}
                            >
                                PDF 업로드
                            </button>
                            <button 
                                className="btn-secondary" 
                                onClick={() => { setInputType('md'); setError(null); }} 
                                style={{
                                    flex: 1, 
                                    fontSize: '0.82rem', 
                                    padding: '0.6rem 0.2rem', 
                                    whiteSpace: 'nowrap',
                                    border: inputType === 'md' ? '1px solid #059669' : '1px solid #cbd5e1',
                                    backgroundColor: inputType === 'md' ? '#059669' : '#ecfdf5', 
                                    color: inputType === 'md' ? 'white' : '#047857', 
                                    fontWeight: 700,
                                    borderRadius: '8px',
                                    boxShadow: inputType === 'md' ? '0 2px 4px rgba(5, 150, 105, 0.2)' : 'none'
                                }}
                            >
                                MD 업로드
                            </button>
                            <button 
                                className="btn-secondary" 
                                onClick={() => { setInputType('text'); setError(null); }} 
                                style={{
                                    flex: 1, 
                                    fontSize: '0.82rem', 
                                    padding: '0.6rem 0.2rem', 
                                    whiteSpace: 'nowrap',
                                    border: inputType === 'text' ? '1px solid #7c3aed' : '1px solid #cbd5e1',
                                    backgroundColor: inputType === 'text' ? '#7c3aed' : '#f5f3ff', 
                                    color: inputType === 'text' ? 'white' : '#6d28d9', 
                                    fontWeight: 700,
                                    borderRadius: '8px',
                                    boxShadow: inputType === 'text' ? '0 2px 4px rgba(124, 58, 237, 0.2)' : 'none'
                                }}
                            >
                                텍스트 입력
                            </button>
                        </div>
                        
                        {inputType === 'pdf' ? (
                            <>
                                <DropZone onFileDrop={handleFileDrop(setExamFile)} file={examFile} title="1. 시험지 업로드" disabled={isLoading} />
                                <DropZone onFileDrop={handleFileDrop(setSolutionFile)} file={solutionFile} title="2. 정답지 업로드 (선택 사항)" disabled={isLoading} />
                                {examFile && (
                                    <div style={{marginBottom: '1rem'}}>
                                        <button 
                                            className="btn-secondary" 
                                            onClick={handleManualConvertPDF} 
                                            disabled={isLoading}
                                            style={{width: '100%', fontSize: '0.85rem', padding: '0.6rem', border: '1px dashed var(--primary-color)', color: 'var(--primary-color)', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer'}}
                                        >
                                            {convertedMarkdown ? '📝 1단계: PDF에서 MD 재변환' : '📝 1단계: PDF를 MD로 먼저 변환'}
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : inputType === 'md' ? (
                            <div className="text-input-section" style={{marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                                <DropZone 
                                    onFileDrop={(file) => {
                                        setMdFile(file);
                                        const reader = new FileReader();
                                        reader.onload = (e) => {
                                            if (e.target?.result) {
                                                const content = e.target.result as string;
                                                setConvertedMarkdown(content);
                                                setActivePreviewTab('markdown');
                                                
                                                const metadataMatch = content.match(/<!--\s*ORIGINAL_FILENAME:\s*(.*?)\s*-->/);
                                                if (metadataMatch && metadataMatch[1]) {
                                                    setExamTitle(metadataMatch[1].trim());
                                                } else {
                                                    const cleanName = file.name.replace(/\.[^/.]+$/, "");
                                                    setExamTitle(cleanName.replace(/_converted$/, "").replace(/-converted$/, ""));
                                                }
                                            }
                                        };
                                        reader.readAsText(file);
                                    }} 
                                    file={mdFile} 
                                    title="1. .md 파일 업로드" 
                                    disabled={isLoading} 
                                    accept=".md"
                                />
                                {convertedMarkdown && (
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <label style={{fontSize: '0.85rem', fontWeight: 600}}>로드된 Markdown 편집</label>
                                            <button onClick={downloadMarkdownFile} className="btn-secondary" style={{padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 'auto', width: 'auto'}}>다운로드</button>
                                        </div>
                                        <textarea
                                            style={{width: '100%', height: '120px', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem'}}
                                            value={convertedMarkdown}
                                            onChange={(e) => setConvertedMarkdown(e.target.value)}
                                            disabled={isLoading}
                                            placeholder="Markdown 내용을 검토하고 바로 수정해보죠..."
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-input-section" style={{marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                                <div>
                                    <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: 600}}>1. 문제지 텍스트 붙여넣기</label>
                                    <textarea 
                                        style={{width: '100%', height: '150px', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', resize: 'vertical'}} 
                                        placeholder="여기에 복사한 문제지 내용을 붙여넣으세요..."
                                        value={rawExamText}
                                        onChange={(e) => setRawExamText(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>
                                <div>
                                    <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: 600}}>2. 정답지 텍스트 붙여넣기 (선택 사항)</label>
                                    <textarea 
                                        style={{width: '100%', height: '150px', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', resize: 'vertical'}} 
                                        placeholder="여기에 복사한 정답지 내용을 붙여넣으세요..."
                                        value={rawSolutionText}
                                        onChange={(e) => setRawSolutionText(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>
                        )}
                        <DropZone onFileDrop={handleFileDrop(setLogoFile)} file={logoFile} title="3. 로고 업로드 (선택 사항)" disabled={isLoading} />

                        {error && <div className="error-message">{error}</div>}

                        <div className="options-section">
                            <div className="option-item">
                                <label style={{fontWeight: 700, fontSize: '0.95rem', display: 'block', marginBottom: '0.5rem'}}>4. 문항 선택</label>
                                 <div style={{display: 'flex', gap: '0.5rem', marginBottom: '0.75rem'}}>
                                    <button 
                                        type="button"
                                        onClick={() => setSelectedQuestions(ALLOWED_QUESTIONS)} 
                                        disabled={isLoading} 
                                        className="btn-secondary" 
                                        style={{
                                            width: '50%', 
                                            fontSize: '0.85rem', 
                                            padding: '0.5rem', 
                                            backgroundColor: '#eff6ff', 
                                            color: '#1d4ed8', 
                                            borderColor: '#bfdbfe',
                                            fontWeight: 600,
                                            borderRadius: '6px'
                                        }}
                                    >
                                        전체 선택
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setSelectedQuestions([])} 
                                        disabled={isLoading} 
                                        className="btn-secondary" 
                                        style={{
                                            width: '50%', 
                                            fontSize: '0.85rem', 
                                            padding: '0.5rem', 
                                            backgroundColor: '#f1f5f9', 
                                            color: '#475569', 
                                            borderColor: '#cbd5e1',
                                            fontWeight: 600,
                                            borderRadius: '6px'
                                        }}
                                    >
                                        전체 해제
                                    </button>
                                </div>
                                
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
                                    gap: '0.4rem',
                                    maxHeight: '180px',
                                    overflowY: 'auto',
                                    padding: '0.6rem',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    backgroundColor: '#fafafa',
                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
                                }}>
                                    {ALLOWED_QUESTIONS.map(q => {
                                        const isSelected = selectedQuestions.includes(q);
                                        return (
                                            <button
                                                key={q}
                                                type="button"
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedQuestions(prev => prev.filter(item => item !== q));
                                                    } else {
                                                        setSelectedQuestions(prev => [...prev, q]);
                                                    }
                                                }}
                                                disabled={isLoading}
                                                style={{
                                                    padding: '0.4rem 0.2rem',
                                                    fontSize: '0.8rem',
                                                    textAlign: 'center',
                                                    border: isSelected ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    backgroundColor: isSelected ? '#3b82f6' : '#ffffff',
                                                    color: isSelected ? '#ffffff' : '#475569',
                                                    fontWeight: isSelected ? 700 : 500,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    transform: 'none',
                                                    boxShadow: isSelected ? '0 2px 4px rgba(59, 130, 246, 0.2)' : 'none'
                                                }}
                                            >
                                                {q.replace('-', '~')}번
                                            </button>
                                        );
                                    })}
                                </div>
                                <small style={{marginTop: '0.5rem', color: '#64748b', fontSize: '0.78rem', display: 'block'}}>
                                    💡 각 번호를 누르시면 개별적으로 선택하거나 해제하실 수 있습니다.
                                </small>
                            </div>
                        </div>

                        <div className="action-buttons">
                             <button 
                                className="btn-primary" 
                                onClick={generateAnalysis} 
                                disabled={(inputType === 'pdf' ? !examFile : (inputType === 'md' ? !convertedMarkdown.trim() : !rawExamText.trim())) || selectedQuestions.length === 0 || isLoading}
                            >
                                {isLoading ? '생성 중...' : (inputType === 'pdf' && !convertedMarkdown ? 'PDF변환 및 해설지 생성' : '해설지 생성')}
                             </button>
                        </div>

                        {isLoading && (
                            <div className="loader">
                                <div className="loader-content">
                                    <div className="spinner"></div>
                                    <span>{loadingMessage}</span>
                                </div>
                                <button onClick={() => isCancelledRef.current = true} className="btn-stop">중지</button>
                            </div>
                        )}

                        {isProcessed && !isLoading && sortedAnalysisData.length > 0 && (
                            <div className="action-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                 <button className="btn-primary" onClick={handleDownload} style={{ width: '100%' }}>
                                    PDF로 다운로드
                                </button>
                                 <button className="btn-secondary" onClick={handlePrint} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <span>🖨️</span> 인쇄 및 미리보기
                                </button>
                            </div>
                        )}
                    </aside>
                    <main className="preview-panel">
                        {convertedMarkdown && !isLoading && (
                            <div className="preview-tabs" style={{display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1.5rem'}}>
                                <button 
                                    className={`preview-tab-btn ${activePreviewTab === 'sheets' ? 'active' : ''}`}
                                    onClick={() => setActivePreviewTab('sheets')}
                                    style={{
                                        padding: '0.6rem 1.2rem', 
                                        borderRadius: '8px', 
                                        fontSize: '0.9rem', 
                                        fontWeight: 600,
                                        background: activePreviewTab === 'sheets' ? 'var(--primary-color)' : '#f3f4f6',
                                        color: activePreviewTab === 'sheets' ? 'white' : '#4b5563',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: activePreviewTab === 'sheets' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    🖨️ 생성된 해설지 인쇄 미리보기 ({sortedAnalysisData.length > 0 ? `${sortedAnalysisData.length}문항 완료` : '준비'})
                                </button>
                                <button 
                                    className={`preview-tab-btn ${activePreviewTab === 'markdown' ? 'active' : ''}`}
                                    onClick={() => setActivePreviewTab('markdown')}
                                    style={{
                                        padding: '0.6rem 1.2rem', 
                                        borderRadius: '8px', 
                                        fontSize: '0.9rem', 
                                        fontWeight: 600,
                                        background: activePreviewTab === 'markdown' ? 'var(--primary-color)' : '#f3f4f6',
                                        color: activePreviewTab === 'markdown' ? 'white' : '#4b5563',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: activePreviewTab === 'markdown' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    📝 변환된 MD 텍스트 편집 및 다운로드
                                </button>
                            </div>
                        )}

                        {isLoading ? (
                            <div className="preview-placeholder">
                                <div className="loader-content">
                                    <div className="spinner"></div>
                                    <span>{loadingMessage}</span>
                                </div>
                            </div>
                        ) : activePreviewTab === 'markdown' && convertedMarkdown ? (
                            <div className="markdown-viewer-dashboard" style={{background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%'}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap'}}>
                                    <div>
                                        <h3 style={{margin: 0, fontSize: '1.1rem', fontWeight: 700}}>📝 변환된 Markdown 내용</h3>
                                        <p style={{margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#666'}}>AI 오독이나 오타를 직접 수정하여 다운로드하거나 해설지를 생성할 수 있습니다.</p>
                                    </div>
                                    <button onClick={downloadMarkdownFile} className="btn-primary" style={{padding: '0.6rem 1.2rem', width: 'auto', fontSize: '0.9rem', background: '#059669', borderColor: '#059669'}}>
                                        📥 Markdown (.md) 다운로드
                                    </button>
                                </div>
                                <textarea
                                    style={{width: '100%', height: '500px', minHeight: '350px', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'Consolas, Monaco, "Courier New", monospace', fontSize: '0.9rem', lineHeight: '1.6', resize: 'vertical', background: '#fafafa'}}
                                    value={convertedMarkdown}
                                    onChange={(e) => setConvertedMarkdown(e.target.value)}
                                    placeholder="변환 중이거나 내용이 비어있습니다."
                                />
                            </div>
                        ) : activePreviewTab === 'sheets' && sortedAnalysisData.length > 0 ? (
                            <div id="preview-content" ref={previewRef}>
                                {sortedAnalysisData.map(data => (
                                    <AnalysisSheet
                                        key={data.questionNumber}
                                        title={examTitle}
                                        questionData={data}
                                        logoDataUrl={logoDataUrl}
                                    />
                                ))}
                            </div>
                        ) : convertedMarkdown ? (
                            <div className="preview-placeholder">
                                <p style={{fontWeight: 600, fontSize: '1.1rem', color: 'var(--primary-color)', marginBottom: '0.5rem'}}>Markdown 변환 및 로드가 완료되었습니다!</p>
                                <p style={{fontSize: '0.95rem', color: '#4b5563', maxWidth: '500px', lineHeight: '1.5'}}>
                                    상단의 <strong style={{color: '#10b981'}}>‘변환된 MD 텍스트’</strong> 탭에서 문항 텍스트를 검토/수정하시거나, <br />
                                    왼쪽 아래의 <strong>‘해설지 생성’</strong> 버튼을 눌러 개별 문항 해설지를 최종 생성해보세요!
                                </p>
                            </div>
                        ) : inputType === 'pdf' && examFile ? (
                            <div className="pdf-preview-container">
                                {examFile.type === 'application/pdf' ? (
                                    <object 
                                        data={examFileURL || ''} 
                                        type="application/pdf" 
                                        width="100%" 
                                        height="100%"
                                        className="pdf-object"
                                    >
                                    </object>
                                ) : (
                                    <img 
                                        src={examFileURL || ''} 
                                        alt="Exam Preview" 
                                        style={{ maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                                    />
                                )}
                            </div>
                        ) : inputType === 'text' && rawExamText.trim() ? (
                            <div className="preview-placeholder">
                                <p>텍스트가 입력되었습니다. 왼쪽에서 '해설지 생성' 버튼을 누르시면 해설지가 생성됩니다.</p>
                            </div>
                        ) : (
                            <div className="preview-placeholder">
                                <p>왼쪽에서 설정을 완료하고 '해설지 생성' 버튼을 누르면 여기에 결과가 표시됩니다.</p>
                            </div>
                        )}
                    </main>
                </div>
            </div>
            <footer className="app-footer">
                <p>© 2025 KH KIM. All Rights Reserved.</p>
            </footer>

            {pdfProgress && (
                <div id="pdf-loader-overlay">
                    <div className="loader-content">
                        <div className="spinner"></div>
                        <span>{pdfProgress}</span>
                    </div>
                </div>
            )}

            {isApiKeyModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, right: 0, bottom: 0, left: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000,
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div style={{
                        backgroundColor: '#ffffff',
                        width: '90%',
                        maxWidth: '520px',
                        borderRadius: '16px',
                        padding: '1.75rem',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        position: 'relative',
                        border: '1px solid #e2e8f0',
                        color: '#1e293b'
                    }}>
                        <button 
                            onClick={() => setIsApiKeyModalOpen(false)}
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                right: '1rem',
                                background: 'transparent',
                                border: 'none',
                                fontSize: '1.25rem',
                                cursor: 'pointer',
                                color: '#64748b',
                                padding: '0.25rem'
                            }}
                            title="닫기"
                        >
                            ✕
                        </button>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>🔑</span>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>Gemini API 키 연결 검증 및 설정</h2>
                        </div>

                        <div style={{ fontSize: '0.88rem', lineHeight: '1.5', color: '#475569', backgroundColor: '#fcfdfd', border: '1px solid #e0f2fe', padding: '0.75rem 1rem', borderRadius: '10px' }}>
                            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: '#0369a1' }}>💡 Gemini API 키 발급 및 복사 안내</p>
                            <span style={{ display: 'block', marginBottom: '0.25rem' }}>1. 사용자의 로컬 드라이브(브라우저 저장소)에 <strong>암호화해서 보관</strong>하므로 안심하고 사용하실 수 있습니다.</span>
                            <span style={{ display: 'block', marginBottom: '0.5rem' }}>2. 아래 링크로 이동하여 로그인 후 <strong>비용 없이 무료로 개인용 API 키를 즉시 발급</strong>받으실 수 있습니다.</span>
                            <a 
                                href="https://aistudio.google.com/app/apikey" 
                                target="_blank" 
                                rel="noreferrer"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    color: '#2563eb',
                                    fontWeight: 'bold',
                                    textDecoration: 'underline',
                                }}
                            >
                                🔗 Google AI Studio API 키 생성 링크로 이동 ↗
                            </a>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Gemini API Key 입력</label>
                            <input 
                                type="password"
                                value={inputApiKey}
                                onChange={(e) => {
                                    setInputApiKey(e.target.value);
                                    setTestStatus('idle');
                                    setTestMessage('');
                                    setIsSaved(false);
                                }}
                                placeholder="AIzaSy..."
                                style={{
                                    width: '100%',
                                    padding: '0.7rem 0.8rem',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    fontFamily: 'monospace'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <button
                                onClick={async () => {
                                    if (!inputApiKey.trim()) {
                                        setTestStatus('error');
                                        setTestMessage("API 키를 먼저 입력해주십시오.");
                                        return;
                                    }
                                    setTestStatus('testing');
                                    setTestMessage("연결 상태를 테스트하고 있습니다...");
                                    try {
                                        const response = await fetch("/api/test-key", {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json"
                                            },
                                            body: JSON.stringify({ apiKey: inputApiKey.trim() })
                                        });
                                        const data = await response.json();
                                        if (response.ok && data.success) {
                                            setTestStatus('success');
                                            setTestMessage(data.message || "연결 성공! API 키가 원활하게 응답합니다.");
                                            
                                            // Auto-save upon successful verification
                                            const encrypted = encryptKey(inputApiKey.trim());
                                            localStorage.setItem("gemini_api_key_encrypted", encrypted);
                                            setIsSaved(true);
                                        } else {
                                            setTestStatus('error');
                                            setTestMessage(data.error || "테스트 요청이 올바르지 않은 API 키에 의해 차단되었습니다.");
                                        }
                                    } catch (err: any) {
                                        setTestStatus('error');
                                        setTestMessage(`연결 과정에 오류가 발생했습니다: ${err.message || err}`);
                                    }
                                }}
                                disabled={testStatus === 'testing'}
                                style={{
                                    flex: 1,
                                    padding: '0.7rem',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    backgroundColor: '#f8fafc',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    color: '#334155',
                                    cursor: 'pointer',
                                    transition: 'all 0.1s'
                                }}
                            >
                                {testStatus === 'testing' ? '🔄 테스트 중...' : '⚡ 연결 테스트'}
                            </button>
                            <button
                                onClick={() => {
                                    if (!inputApiKey.trim()) {
                                        alert("API 키를 먼저 입력해주십시오.");
                                        return;
                                    }
                                    const encrypted = encryptKey(inputApiKey.trim());
                                    localStorage.setItem("gemini_api_key_encrypted", encrypted);
                                    setIsSaved(true);
                                    setTestStatus('success');
                                    setTestMessage("암호화되어 브라우저 로컬 드라이브에 정상 저장되었습니다.");
                                }}
                                style={{
                                    flex: 1,
                                    padding: '0.7rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: '#2563eb',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                                }}
                            >
                                💾 저장하기
                            </button>
                        </div>

                        {testStatus !== 'idle' && (
                            <div style={{
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                lineHeight: '1.4',
                                backgroundColor: 
                                    testStatus === 'testing' ? '#f1f5f9' :
                                    testStatus === 'success' ? '#ecfdf5' : '#fef2f2',
                                border: 
                                    testStatus === 'testing' ? '1px solid #e2e8f0' :
                                    testStatus === 'success' ? '1px solid #a7f3d0' : '1px solid #fca5a5',
                                color: 
                                    testStatus === 'testing' ? '#475569' :
                                    testStatus === 'success' ? '#047857' : '#b91c1c'
                            }}>
                                {testStatus === 'success' && '✅ '}
                                {testStatus === 'error' && '❌ '}
                                {testMessage}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                            <button 
                                onClick={() => {
                                    // Remove saved API key and reset
                                    localStorage.removeItem("gemini_api_key_encrypted");
                                    setInputApiKey('');
                                    setTestStatus('idle');
                                    setTestMessage('');
                                    setIsSaved(false);
                                    alert("로컬 드라이브에 저장된 API 키가 정상 삭제되었습니다.");
                                }}
                                style={{
                                    padding: '0.5rem 0.8rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: '#f1f5f9',
                                    color: '#ef4444',
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                }}
                            >
                                🗑️ 저장된 키 삭제
                            </button>
                            <button 
                                onClick={() => setIsApiKeyModalOpen(false)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    backgroundColor: '#ffffff',
                                    color: '#475569',
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                }}
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default App;