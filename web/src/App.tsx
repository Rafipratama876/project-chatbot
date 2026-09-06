import { NavLink, Route, Routes } from 'react-router-dom';
import DesignsListPage from './pages/DesignsListPage';
import ProductPickerPage from './pages/ProductPickerPage';
import NewDesignWizardPage from './pages/NewDesignWizardPage';
import NewDimensionalLetterWizardPage from './pages/NewDimensionalLetterWizardPage';
import NewSignCabinetWizardPage from './pages/NewSignCabinetWizardPage';
import ReviewPage from './pages/ReviewPage';
import DLReviewPage from './pages/DLReviewPage';
import SCReviewPage from './pages/SCReviewPage';

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" />
          Sign Pack
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
          {/* Product picker first — Channel Letters' own wizard is unmodified,
              just reached one click later than it used to be reached directly. */}
          <Route path="/new" element={<ProductPickerPage />} />
          <Route path="/new/channel-letters" element={<NewDesignWizardPage />} />
          <Route path="/new/dimensional-letters" element={<NewDimensionalLetterWizardPage />} />
          <Route path="/new/sign-cabinets" element={<NewSignCabinetWizardPage />} />
          <Route path="/designs/:id" element={<ReviewPage />} />
          <Route path="/dl-designs/:id" element={<DLReviewPage />} />
          <Route path="/sc-designs/:id" element={<SCReviewPage />} />
        </Routes>
      </main>
    </div>
  );
}
