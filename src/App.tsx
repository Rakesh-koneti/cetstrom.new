import { BrowserRouter as Router } from 'react-router-dom';
import { ThemeProvider } from './lib/theme-context';
import { AuthProvider } from './lib/auth-context';
import { Navbar } from './components/navbar';
import { AppRoutes } from './routes';

export default function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors">
        <Router>
          <AuthProvider>
            <Navbar />
            <main className="min-h-[calc(100vh-4rem)]">
              <AppRoutes />
            </main>
          </AuthProvider>
        </Router>
      </div>
    </ThemeProvider>
  );
}