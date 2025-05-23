import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../lib/theme-context';
import { useAuth } from '../lib/auth-context';
import { Exam } from '../lib/types';
import { ExamService, ResultService } from '../services';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Save,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

export function ExamPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user, isInitialized } = useAuth();
  const isDark = theme === 'dark';
  const [exam, setExam] = useState<Exam | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [startTime] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Load exam data from database
    const loadExam = async () => {
      if (!examId) {
        console.error('No exam ID provided');
        setError('Invalid exam ID');
        setIsLoading(false);
        return;
      }

      try {
        console.log('Fetching exam with ID:', examId);
        
        // First try to load from localStorage for practice tests
        const cachedExams = localStorage.getItem('stream_exams_engineering') || localStorage.getItem('stream_exams_pharmacy');
        if (cachedExams) {
          const allExams = JSON.parse(cachedExams);
          const cachedExam = allExams.find((e: Exam) => e.id === examId);
          if (cachedExam) {
            console.log('Found exam in cache:', cachedExam);
            setExam(cachedExam);
            setTimeLeft(cachedExam.duration * 60);
            setIsLoading(false);
            return;
          }
        }

        // If not found in cache, try loading from database
        const currentExam = await ExamService.getExamById(examId);

        if (!currentExam) {
          console.error('Exam not found for ID:', examId);
          setError('Exam not found');
          setIsLoading(false);
          return;
        }

        console.log('Exam data:', currentExam);

        if (!currentExam.sections || currentExam.sections.length === 0) {
          console.error('Exam has no sections:', examId);
          setError('This exam has no questions');
          setIsLoading(false);
          return;
        }

        let hasQuestions = false;
        for (const section of currentExam.sections) {
          if (section.questions && section.questions.length > 0) {
            hasQuestions = true;
            break;
          }
        }

        if (!hasQuestions) {
          console.error('Exam has no questions in any section:', examId);
          setError('This exam has no questions');
          setIsLoading(false);
          return;
        }

        setExam(currentExam);
        setTimeLeft(currentExam.duration * 60);
        setIsLoading(false);
        console.log('Exam loaded successfully:', currentExam.title);
      } catch (err) {
        console.error('Error loading exam:', err);
        setError('Failed to load exam. Please try again.');
        setIsLoading(false);
      }
    };

    loadExam();
  }, [examId]);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleSubmit();
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timeLeft]);

  const handleAnswer = (questionId: string, optionIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handleSubmit = async () => {
    if (!exam || !examId) return;
    setIsLoading(true);

    try {
      let correctAnswers = 0;
      let wrongAnswers = 0;
      let totalScore = 0;

      exam.sections.forEach((section) => {
        section.questions.forEach((question) => {
          const userAnswer = answers[question.id];
          if (userAnswer === undefined) return;

          if (userAnswer === question.correctAnswer) {
            correctAnswers++;
            totalScore += question.weightage;
          } else {
            wrongAnswers++;
            totalScore -= section.negativeMarking;
          }
        });
      });

      const totalQuestions = exam.sections.reduce(
        (sum, section) => sum + section.questions.length,
        0
      );

      const percentage = (totalScore / (totalQuestions * exam.markingScheme.defaultWeightage)) * 100;
      const timeTaken = Math.floor((Date.now() - startTime) / 1000);

      const results = {
        totalQuestions,
        correctAnswers,
        wrongAnswers,
        score: totalScore,
        percentage,
        timeTaken,
        isPassed: percentage >= exam.markingScheme.passingPercentage,
        answers,
      };

      // Save results to localStorage as backup
      localStorage.setItem(`examResult_${examId}`, JSON.stringify(results));

      // Save results to database
      const userId = user?.email || 'anonymous';
      await ResultService.saveResult({
        testId: examId,
        userId,
        score: totalScore,
        answers: {
          userAnswers: answers,
          correctAnswers,
          wrongAnswers,
          timeTaken,
          percentage,
          isPassed: percentage >= exam.markingScheme.passingPercentage
        }
      });

      // We no longer mark the exam as completed so it remains visible in the list
      // This allows users to take the exam multiple times

      // Update the exam in localStorage but don't mark it as completed
      const exams = JSON.parse(localStorage.getItem('exams') || '[]');
      const examIndex = exams.findIndex((e: Exam) => e.id === examId);
      if (examIndex !== -1) {
        // Just update the lastAttemptedAt field instead of marking as completed
        exams[examIndex].lastAttemptedAt = new Date().toISOString();
        localStorage.setItem('exams', JSON.stringify(exams));
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error submitting exam:', error);
      // Still navigate to results page even if there's an error
      // The results are saved in localStorage as backup
    }

    // Navigate to results page
    navigate(`/exam/${examId}/result`);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-white dark:bg-gray-900">
        <div className={`text-center max-w-md w-full p-6 rounded-lg shadow-lg ${
          isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
        }`}>
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-2xl font-bold mb-4">Error Loading Exam</h2>
          <p className="text-lg mb-6">{error}</p>
          <div className="flex flex-col gap-4">
            <button
              onClick={() => window.location.reload()}
              className={`w-full px-4 py-2 rounded-lg font-medium ${
                isDark
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : 'bg-violet-500 text-white hover:bg-violet-400'
              }`}
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/exams')}
              className={`w-full px-4 py-2 rounded-lg font-medium ${
                isDark
                  ? 'bg-gray-700 text-white hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
              Back to Exams
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-900">
        <Loader2 className={`h-8 w-8 animate-spin ${
          isDark ? 'text-white' : 'text-gray-900'
        }`} />
        <p className={`mt-4 text-lg ${
          isDark ? 'text-white' : 'text-gray-900'
        }`}>
          Loading exam...
        </p>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className={`text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-2xl font-bold mb-2">Exam Not Found</h2>
          <p className="text-lg">{error || 'Unable to load the exam'}</p>
          <button
            onClick={() => navigate('/exams')}
            className={`mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              isDark
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            }`}
          >
            Back to Tests
          </button>
        </div>
      </div>
    );
  }

  const currentSectionData = exam.sections[currentSection];
  const currentQuestionData = currentSectionData?.questions[currentQuestion];

  if (!currentSectionData || !currentQuestionData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className={`text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-2xl font-bold mb-2">Error</h2>
          <p className="text-lg">Unable to load exam questions</p>
          <button
            onClick={() => navigate('/exams')}
            className={`mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              isDark
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            }`}
          >
            Back to Tests
          </button>
        </div>
      </div>
    );
  }

  const totalQuestions = exam.sections.reduce(
    (sum, section) => sum + section.questions.length,
    0
  );

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className={`flex items-center justify-between mb-8 ${
        isDark ? 'text-white' : 'text-gray-900'
      }`}>
        <h1 className="text-2xl font-bold">{exam.title}</h1>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            timeLeft < 300 ? 'bg-red-100 text-red-700' : isDark ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            <Clock className="h-5 w-5" />
            <span>
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              isDark
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            } ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                Submit
              </>
            )}
          </button>
        </div>
      </div>

      {/* Question Area */}
      <div className={`rounded-lg p-6 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      } shadow-lg ring-1 ${
        isDark ? 'ring-gray-700' : 'ring-gray-200'
      }`}>
        {/* Section Info */}
        <div className="mb-6">
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {currentSectionData.name}
          </h2>
          {currentSectionData.instructions && (
            <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {currentSectionData.instructions}
            </p>
          )}
        </div>

        {/* Question */}
        <div className="space-y-6">
          <div>
            <div className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Question {currentQuestion + 1} of {currentSectionData.questions.length}
            </div>
            <p className={`mt-2 text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {currentQuestionData.text}
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {currentQuestionData.options.map((option, index) => (
              <label
                key={index}
                className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-colors ${
                  answers[currentQuestionData.id] === index
                    ? isDark
                      ? 'bg-violet-500 text-white ring-2 ring-violet-500'
                      : 'bg-violet-50 text-violet-900 ring-2 ring-violet-500'
                    : isDark
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 ${
                    answers[currentQuestionData.id] === index
                      ? isDark
                        ? 'border-white bg-white'
                        : 'border-violet-500 bg-violet-500'
                      : isDark
                      ? 'border-gray-400'
                      : 'border-gray-400'
                  } flex items-center justify-center`}>
                    {answers[currentQuestionData.id] === index && (
                      <div className={`w-2 h-2 rounded-full ${
                        isDark ? 'bg-violet-500' : 'bg-white'
                      }`} />
                    )}
                  </div>
                  <input
                    type="radio"
                    name={`question-${currentQuestionData.id}`}
                    checked={answers[currentQuestionData.id] === index}
                    onChange={() => handleAnswer(currentQuestionData.id, index)}
                    className="hidden"
                  />
                  <span className={`flex-1 ${
                    answers[currentQuestionData.id] === index
                      ? 'font-medium'
                      : ''
                  }`}>
                    {option}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => {
              if (currentQuestion > 0) {
                setCurrentQuestion(currentQuestion - 1);
              } else if (currentSection > 0) {
                setCurrentSection(currentSection - 1);
                setCurrentQuestion(exam.sections[currentSection - 1].questions.length - 1);
              }
            }}
            disabled={currentSection === 0 && currentQuestion === 0}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              isDark
                ? 'bg-gray-700 text-white hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400'
            }`}
          >
            <ChevronLeft className="h-5 w-5" />
            Previous
          </button>

          <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Question {currentQuestion + 1} of {currentSectionData.questions.length}
          </div>

          <button
            onClick={() => {
              if (currentQuestion < currentSectionData.questions.length - 1) {
                setCurrentQuestion(currentQuestion + 1);
              } else if (currentSection < exam.sections.length - 1) {
                setCurrentSection(currentSection + 1);
                setCurrentQuestion(0);
              }
            }}
            disabled={
              currentSection === exam.sections.length - 1 &&
              currentQuestion === currentSectionData.questions.length - 1
            }
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              isDark
                ? 'bg-gray-700 text-white hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400'
            }`}
          >
            Next
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Question Palette */}
      <div className={`mt-8 rounded-lg p-6 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      } shadow-lg ring-1 ${
        isDark ? 'ring-gray-700' : 'ring-gray-200'
      }`}>
        <h3 className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Question Palette
        </h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {exam.sections.map((section, sIndex) =>
            section.questions.map((question, qIndex) => {
              const isAnswered = answers[question.id] !== undefined;
              const isActive =
                currentSection === sIndex && currentQuestion === qIndex;

              return (
                <button
                  key={question.id}
                  onClick={() => {
                    setCurrentSection(sIndex);
                    setCurrentQuestion(qIndex);
                  }}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-violet-600 text-white'
                      : isAnswered
                      ? isDark
                        ? 'bg-green-500 text-white'
                        : 'bg-green-100 text-green-700'
                      : isDark
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {qIndex + 1}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}