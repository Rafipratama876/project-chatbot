import { NavLink, Route, Routes } from 'react-router-dom';
import DesignsListPage from './pages/DesignsListPage';
import NewDesignWizardPage from './pages/NewDesignWizardPage';
import ReviewPage from './pages/ReviewPage';

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" />
          Sign Pack — Channel Letters
        </div>
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          My Designs
        </NavLink>
        <NavLink to="/new" className={({ isActive }) => (isActive ? 'active' : '')}>
          New Design
        </NavLink>
        <p className="sidebar-note">
          Pre-sales concept proofs. Not for production, permit or engineering use.
        </p>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<DesignsListPage />} />
          <Route path="/new" element={<NewDesignWizardPage />} />
          <Route path="/designs/:id" element={<ReviewPage />} />
        </Routes>
      </main>
    </div>
  );
}
