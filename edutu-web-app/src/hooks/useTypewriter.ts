import { useState, useEffect } from 'react';

const useTypewriter = (texts: string[], delay: number = 150, pause: number = 2000) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopIndex, setLoopIndex] = useState(0);

  useEffect(() => {
    const handleTyping = () => {
      const currentString = texts[loopIndex % texts.length];
      
      if (isDeleting) {
        // Deleting phase
        setCurrentText(currentString.substring(0, currentText.length - 1));
        if (currentText === '') {
          setIsDeleting(false);
          setCurrentIndex(0);
        }
      } else {
        // Typing phase
        setCurrentText(currentString.substring(0, currentIndex + 1));
        if (currentIndex === currentString.length) {
          // Pause at the end of typing
          setTimeout(() => {
            setIsDeleting(true);
          }, pause);
          return;
        }
        setCurrentIndex((prev) => prev + 1);
      }
    };

    const timeout = setTimeout(handleTyping, isDeleting ? delay / 2 : delay);
    return () => clearTimeout(timeout);
  }, [currentText, currentIndex, isDeleting, texts, delay, pause, loopIndex]);

  useEffect(() => {
    if (currentText === '' && !isDeleting) {
      setLoopIndex((prev) => prev + 1);
    }
  }, [currentText, isDeleting]);

  return currentText;
};

export default useTypewriter;