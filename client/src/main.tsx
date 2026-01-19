import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import App from './pages/App'
import AddProduct from './pages/AddProduct'
import Inventory from './pages/Inventory'
import Login from './pages/Login'
import Restock from './pages/Restock'
import PointsCombo from './pages/PointsCombo'
import PointsCalculation from './pages/PointsCalculation'
import ProtectedRoute from './components/ProtectedRoute'
import './styles.css'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      { 
        index: true, 
        element: (
          <ProtectedRoute>
            <Inventory />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'add-product', 
        element: (
          <ProtectedRoute>
            <AddProduct />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'restock', 
        element: (
          <ProtectedRoute>
            <Restock />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'points-combo', 
        element: (
          <ProtectedRoute>
            <PointsCombo />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'points-calculation', 
        element: (
          <ProtectedRoute>
            <PointsCalculation />
          </ProtectedRoute>
        ) 
      }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
)
