import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, query, getDocs, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';

// **HINWEIS**: Liest die Konfiguration aus den Vercel Umgebungsvariablen
const firebaseConfig = process.env.REACT_APP_FIREBASE_CONFIG ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG) : {};
const appId = firebaseConfig.projectId || 'default-app-id';
const geminiApiKey = process.env.REACT_APP_GEMINI_API_KEY || "";

// Liste gängiger Vorratsartikel
const COMMON_PANTRY_ITEMS = [
  'Salz', 'Pfeffer', 'Zucker', 'Mehl', 'Backpulver', 'Olivenöl', 'Pflanzenöl', 'Essig',
  'Senf', 'Ketchup', 'Mayonnaise', 'Sojasauce', 'Honig', 'Brühe', 'Tomatenmark',
  'Zwiebeln', 'Knoblauch', 'Eier', 'Milch', 'Butter', 'Reis', 'Nudeln',
  'Haferflocken', 'Kaffee', 'Tee', 'Paprikapulver', 'Currypulver', 'Oregano', 'Basilikum'
].sort();


// === ICONS ===
const CookbookIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
const PantryIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>;
const FriendsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;

// Hilfskomponenten
const StarRating = ({ rating, onRatingChange }) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, index) => {
      const starValue = index + 1;
      return (
        <svg key={starValue} onClick={() => onRatingChange(starValue)} className={`w-6 h-6 cursor-pointer ${starValue <= rating ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      );
    })}
  </div>
);

// Hauptkomponente der App
export default function App() {
  // === STATE MANAGEMENT ===
  const [image, setImage] = useState(null);
  const [ingredients, setIngredients] = useState('');
  const [isIngredientsConfirmed, setIsIngredientsConfirmed] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [error, setError] = useState('');
  const [loadingState, setLoadingState] = useState({ identifying: false, finding: false, generating: false });
  const [base64Image, setBase64Image] = useState(null);
  const [pendingRecipeChoice, setPendingRecipeChoice] = useState(null);
  
  // Firebase & User State
  const [auth, setAuth] = useState(null);
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userData, setUserData] = useState({ pantry: [], friends: [] });
  const [cookbook, setCookbook] = useState([]);
  const [friendCookbook, setFriendCookbook] = useState([]);
  const [friendId, setFriendId] = useState('');
  const [loadingFriendCookbook, setLoadingFriendCookbook] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [showShareLink, setShowShareLink] = useState(false);
  const [newPantryItem, setNewPantryItem] = useState('');
  const [newFriendId, setNewFriendId] = useState('');
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  // UI State
  const [currentView, setCurrentView] = useState('main');
  const [cookbookView, setCookbookView] = useState('recipes');

  // === API KEYS UND KONSTANTEN ===
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
  const imageUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${geminiApiKey}`;

  // === FIREBASE INITIALISIERUNG & URL-HANDLING ===
  useEffect(() => {
    try {
      if (Object.keys(firebaseConfig).length > 0) {
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);
        setAuth(authInstance);
        setDb(dbInstance);

        onAuthStateChanged(authInstance, async (user) => {
          if (user) {
            setUserId(user.uid);
          } else {
            await signInAnonymously(authInstance);
          }
        });
      }

      const urlParams = new URLSearchParams(window.location.search);
      const sharedUserId = urlParams.get('user');
      if (sharedUserId) { setFriendId(sharedUserId); setCurrentView('cookbook'); }
    } catch (e) { console.error("Firebase initialization error", e); showError("Verbindung zur Datenbank fehlgeschlagen."); }
  }, []);

  useEffect(() => { if (db && friendId && currentView === 'cookbook') { viewFriendCookbook(); } }, [db, friendId, currentView]);

  // === FIREBASE DATEN-SYNCHRONISATION ===
  useEffect(() => {
    if (!db || !userId) return;

    const userDocRef = doc(db, 'artifacts', appId, 'users', userId);
    const userUnsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setUserData({
          pantry: data.pantry || [],
          friends: data.friends || []
        });
      } else {
        setDoc(userDocRef, { pantry: [], friends: [] });
      }
    });

    const cookbookRef = collection(db, 'artifacts', appId, 'users', userId, 'cookbook');
    const cookbookUnsubscribe = onSnapshot(cookbookRef, (snapshot) => {
        const savedRecipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCookbook(savedRecipes);
    });

    return () => {
      userUnsubscribe();
      cookbookUnsubscribe();
    };
  }, [db, userId]);

  // Listener für Kommentare
  useEffect(() => {
      if (!db || !selectedRecipe) {
          setComments([]);
          return;
      };

      const recipeId = selectedRecipe.recipeName ? selectedRecipe.recipeName.replace(/\s+/g, '-').toLowerCase() : null;
      if (!recipeId) return;

      const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'recipes', recipeId, 'comments');
      const q = query(commentsRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
          const fetchedComments = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
          setComments(fetchedComments);
      });

      return () => unsubscribe();

  }, [db, selectedRecipe]);

  // === HELPER-FUNKTIONEN ===
  const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });

  const showError = (message) => { console.error(message); setError(message); setTimeout(() => setError(''), 5000); };
  const handleReset = () => { setImage(null); setIngredients(''); setIsIngredientsConfirmed(false); setRecipes([]); setSelectedRecipe(null); setError(''); setBase64Image(null); setLoadingState({ identifying: false, finding: false, generating: false }); setCurrentView('main'); setPendingRecipeChoice(null); };
  const handleBackToChoices = () => { setSelectedRecipe(null); setError(''); setPendingRecipeChoice(null); };

  // === KERNFUNKTIONEN (API-AUFRUFE) ===
  const identifyIngredients = async (b64Image) => {
    setLoadingState({ identifying: true, finding: false, generating: false });
    setError('');
    try {
      const payload = { contents: [{ role: "user", parts: [{ text: "Identifiziere die Hauptzutaten auf diesem Bild. Gib nur eine durch Kommas getrennte Liste der Zutaten zurück, ohne einleitenden Text. Beispiel: Tomaten, Zwiebeln, Knoblauch" }, { inlineData: { mimeType: "image/jpeg", data: b64Image } }] }] };
      const response = await fetch(geminiApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`API-Fehler bei der Zutatenerkennung: ${response.statusText}`);
      const result = await response.json();
      if (result.candidates && result.candidates[0].content.parts[0].text) {
        setIngredients(result.candidates[0].content.parts[0].text.trim());
      } else { throw new Error("Zutaten konnten nicht erkannt werden. Versuchen Sie ein anderes Bild."); }
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingState(prev => ({ ...prev, identifying: false }));
    }
  };

  const findRecipes = async () => {
    setIsIngredientsConfirmed(true);
    setLoadingState({ identifying: false, finding: true, generating: false });
    try {
      const payload = { contents: [{ role: "user", parts: [{ text: `Finde 3 unterschiedliche, einfache Rezepte mit einigen dieser Zutaten: ${ingredients}. Gib für jedes Rezept einen Namen, eine Beschreibung, den Zeitaufwand und eine Liste der benötigten speziellen Küchengeräte (z.B. Mixer, Fritteuse) zurück.` }] }], generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { recipes: { type: "ARRAY", items: { type: "OBJECT", properties: { recipeName: { type: "STRING" }, description: { type: "STRING" }, estimatedTime: { type: "STRING" }, requiredAppliances: { type: "ARRAY", items: { type: "STRING" } } }, required: ["recipeName", "description", "estimatedTime", "requiredAppliances"] } } } } } };
      const response = await fetch(geminiApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`API-Fehler: ${response.statusText}`);
      const result = await response.json();
      if (result.candidates && result.candidates[0].content.parts[0].text) {
        const parsedResult = JSON.parse(result.candidates[0].content.parts[0].text);
        setRecipes(parsedResult.recipes || []);
      } else { throw new Error("Konnte keine Rezepte finden."); }
    } catch (err) { 
        showError(err.message);
        setIsIngredientsConfirmed(false);
    } finally { 
        setLoadingState({ identifying: false, finding: false, generating: false }); 
    }
  };

  const generateRecipeDetails = async (recipeChoice, blockUntilImagesReady) => {
    setPendingRecipeChoice(null);
    setSelectedRecipe({ ...recipeChoice, steps: [], ingredients: [] });
    setLoadingState({ identifying: false, finding: false, generating: true });
    
    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: `Erstelle eine detaillierte Anleitung und eine Zutatenliste für "${recipeChoice.recipeName}". Gib für jeden Schritt eine Anweisung und einen Bild-Prompt zurück.` }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { ingredients: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, quantity: { type: "STRING" } }, required: ["name", "quantity"] } }, steps: { type: "ARRAY", items: { type: "OBJECT", properties: { instruction: { type: "STRING" }, imagePrompt: { type: "STRING" } }, required: ["instruction", "imagePrompt"] } } } } }
      };
      const response = await fetch(geminiApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`API-Fehler: ${response.statusText}`);
      const result = await response.json();
      
      if (result.candidates && result.candidates[0].content.parts[0].text) {
        const recipeData = JSON.parse(result.candidates[0].content.parts[0].text);
        const recipeWithDetails = { ...recipeChoice, ...recipeData, steps: recipeData.steps.map(step => ({ ...step, imageUrl: null, imageLoading: true })) };
        
        setSelectedRecipe(recipeWithDetails);
        setLoadingState({ identifying: false, finding: false, generating: !blockUntilImagesReady });
        
        const imagePromise = generateImagesForSteps(recipeData.steps, recipeChoice, ingredients);
        
        if (blockUntilImagesReady) {
          await imagePromise;
          setLoadingState({ identifying: false, finding: false, generating: false });
        }
      } else { throw new Error("Rezeptdetails konnten nicht erstellt werden."); }
    } catch (err) { 
        showError(err.message); 
        setLoadingState({ identifying: false, finding: false, generating: false });
        setSelectedRecipe(null);
    }
  };
  
  const generateImagesForSteps = async (steps, recipeChoice, originalIngredients) => {
    let currentSteps = steps.map(step => ({ ...step, imageUrl: null, imageLoading: true }));
    for (let i = 0; i < steps.length; i++) {
      try {
        const improvedPrompt = `${steps[i].imagePrompt}, featuring the ingredients: ${originalIngredients}. Style: food photography, hyperrealistic, high detail.`;
        const payload = { instances: [{ prompt: improvedPrompt }], parameters: { sampleCount: 1 } };
        const response = await fetch(imageUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`API-Fehler bei der Bildgenerierung: ${response.statusText}`);
        const result = await response.json();
        if (result.predictions && result.predictions[0].bytesBase64Encoded) {
          const generatedImageUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
          currentSteps[i] = { ...currentSteps[i], imageUrl: generatedImageUrl, imageLoading: false };
          setSelectedRecipe(prev => ({ ...prev, steps: [...currentSteps] }));
        } else { throw new Error(`Bild für Schritt ${i + 1} konnte nicht generiert werden.`); }
      } catch (err) {
        showError(err.message);
        currentSteps[i] = { ...currentSteps[i], imageLoading: false, imageUrl: null };
        setSelectedRecipe(prev => ({ ...prev, steps: [...currentSteps] }));
      }
    }
  };

  // === COOKBOOK, PANTRY, FRIENDS & COMMENTS FUNKTIONEN ===
  const saveRecipeToCookbook = async (recipeData) => {
    if (!db || !userId) { showError("Sie müssen angemeldet sein."); return; }
    const recipeId = recipeData.recipeName.replace(/\s+/g, '-').toLowerCase();
    const isAlreadySaved = cookbook.some(recipe => recipe.id === recipeId);
    if (isAlreadySaved) {
        showError("Dieses Rezept ist bereits in Ihrem Kochbuch.");
        return;
    }
    
    const recipeToSave = {
      recipeName: recipeData.recipeName, description: recipeData.description, estimatedTime: recipeData.estimatedTime,
      requiredAppliances: recipeData.requiredAppliances, ingredients: recipeData.ingredients,
      steps: recipeData.steps.map(({ instruction, imagePrompt }) => ({ instruction, imagePrompt })),
      id: recipeId, rating: 0, isPublic: false, savedAt: new Date()
    };

    const recipeDocRef = doc(db, 'artifacts', appId, 'users', userId, 'cookbook', recipeId);
    await setDoc(recipeDocRef, recipeToSave);
  };

  const updateRecipeInCookbook = async (recipeId, updatedData) => {
    if (!db || !userId) return;

    const dataToUpdate = { ...updatedData };
    delete dataToUpdate.id;

    const recipeDocRef = doc(db, 'artifacts', appId, 'users', userId, 'cookbook', recipeId);
    await setDoc(recipeDocRef, dataToUpdate, { merge: true });

    if (updatedData.isPublic) {
        const publicDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'cookbooks', userId, 'recipes', recipeId);
        await setDoc(publicDocRef, { ...dataToUpdate, originalOwner: userId });
    } else {
        const publicDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'cookbooks', userId, 'recipes', recipeId);
        await deleteDoc(publicDocRef);
    }
  };

  const addPantryItem = async () => {
    if (!db || !userId || !newPantryItem) return;
    const updatedPantry = [...userData.pantry, newPantryItem];
    await setDoc(doc(db, 'artifacts', appId, 'users', userId), { pantry: updatedPantry }, { merge: true });
    setNewPantryItem('');
  };

  const removePantryItem = async (itemToRemove) => {
    if (!db || !userId) return;
    const updatedPantry = userData.pantry.filter(item => item !== itemToRemove);
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId), { pantry: updatedPantry });
  };
  
  const togglePantryItem = async (itemToToggle) => {
    if (!db || !userId) return;
    const itemExists = userData.pantry.includes(itemToToggle);
    let updatedPantry;
    if (itemExists) {
      updatedPantry = userData.pantry.filter(item => item !== itemToToggle);
    } else {
      updatedPantry = [...userData.pantry, itemToToggle];
    }
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId), { pantry: updatedPantry });
  };
  
  const addFriend = async () => {
      if (!db || !userId || !newFriendId) return;
      if (newFriendId === userId) { showError("Du kannst dich nicht selbst als Freund hinzufügen."); return; }
      const updatedFriends = [...(userData.friends || []), newFriendId];
      await updateDoc(doc(db, 'artifacts', appId, 'users', userId), { friends: updatedFriends });
      setNewFriendId('');
  };
  
  const removeFriend = async (friendIdToRemove) => {
      if (!db || !userId) return;
      const updatedFriends = (userData.friends || []).filter(id => id !== friendIdToRemove);
      await updateDoc(doc(db, 'artifacts', appId, 'users', userId), { friends: updatedFriends });
  };

  const addComment = async () => {
      if (!db || !userId || !newComment.trim() || !selectedRecipe) return;
      const recipeId = selectedRecipe.recipeName.replace(/\s+/g, '-').toLowerCase();
      const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'recipes', recipeId, 'comments');
      await addDoc(commentsRef, {
          text: newComment,
          authorId: userId,
          createdAt: serverTimestamp()
      });
      setNewComment('');
  };
  
  const viewFriendCookbook = async () => {
    // ... (unverändert)
  };

  const generateShareLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?user=${userId}`;
    setShareLink(link);
    setShowShareLink(true);
  };

  const copyToClipboard = (text) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
          document.execCommand('copy');
          showError("Link kopiert!");
      } catch (err) {
          showError('Fehler beim Kopieren des Links.');
      }
      document.body.removeChild(textArea);
  };

  // === EVENT HANDLER ===
  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      setImage(null); setIngredients(''); setIsIngredientsConfirmed(false); setRecipes([]); setSelectedRecipe(null); setError(''); setBase64Image(null);
      const file = e.target.files[0];
      setImage(URL.createObjectURL(file));
      try {
        const b64 = await toBase64(file);
        setBase64Image(b64);
        await identifyIngredients(b64);
      } catch (err) { showError("Bild konnte nicht verarbeitet werden."); handleReset(); }
    }
  };
  const handleIngredientsChange = (e) => { setIngredients(e.target.value); };
  const handleRecipeSelect = (recipe) => { setPendingRecipeChoice(recipe); }

  // === RENDER-FUNKTIONEN ===
  const renderHeader = () => (
    <header className="text-center mb-8">
      <h1 className="text-4xl sm:text-5xl font-bold text-stone-800 tracking-tight">Foto 'n cook</h1>
      <p className="mt-2 text-lg text-stone-600 max-w-2xl mx-auto">Vom Foto zum fertigen Gericht!</p>
      <nav className="mt-6 flex justify-center items-center gap-4 border-b border-amber-200 pb-4">
        <button onClick={() => setCurrentView('main')} className={`px-4 py-2 rounded-md font-semibold flex items-center ${currentView === 'main' ? 'bg-orange-500 text-white' : 'bg-amber-100 text-amber-800'}`}><SearchIcon />Rezeptsuche</button>
        <button onClick={() => setCurrentView('cookbook')} className={`px-4 py-2 rounded-md font-semibold flex items-center ${currentView === 'cookbook' ? 'bg-orange-500 text-white' : 'bg-amber-100 text-amber-800'}`}><CookbookIcon />Mein Bereich</button>
      </nav>
    </header>
  );

  const renderCookbookView = () => (
    <div className="bg-white p-8 rounded-2xl shadow-lg border border-amber-200">
        <div className="flex border-b border-amber-200 mb-6">
            <button onClick={() => setCookbookView('recipes')} className={`flex items-center px-4 py-2 font-semibold ${cookbookView === 'recipes' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-stone-500'}`}><CookbookIcon />Mein Kochbuch</button>
            <button onClick={() => setCookbookView('pantry')} className={`flex items-center px-4 py-2 font-semibold ${cookbookView === 'pantry' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-stone-500'}`}><PantryIcon />Meine Vorratskammer</button>
            <button onClick={() => setCookbookView('friends')} className={`flex items-center px-4 py-2 font-semibold ${cookbookView === 'friends' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-stone-500'}`}><FriendsIcon />Freunde</button>
        </div>

        {cookbookView === 'recipes' && (
            <div>
                <h2 className="text-3xl font-bold text-stone-800 mb-6 flex items-center"><CookbookIcon />Gespeicherte Rezepte</h2>
                 <button onClick={generateShareLink} className="mb-6 w-full bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors duration-200 shadow-sm flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>
                    Mein Kochbuch teilen
                </button>
                {showShareLink && (
                    <div className="mb-6 p-4 bg-amber-50 rounded-lg">
                        <label className="block text-sm font-medium text-stone-700 mb-1">Dein persönlicher Share-Link:</label>
                        <div className="flex gap-2">
                            <input type="text" readOnly value={shareLink} className="w-full p-2 border border-amber-300 rounded-md bg-white" />
                            <button onClick={() => copyToClipboard(shareLink)} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-600">Kopieren</button>
                        </div>
                    </div>
                )}
                {cookbook.length === 0 ? (
                    <p className="text-stone-600">Du hast noch keine Rezepte gespeichert.</p>
                ) : (
                    <div className="space-y-6">
                        {cookbook.map(recipe => (
                             <div key={recipe.id} className="border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start gap-4">
                                <div className="flex-grow">
                                    <h3 className="font-bold text-xl text-stone-800">{recipe.recipeName}</h3>
                                    <p className="text-sm text-stone-600 mt-1">{recipe.description}</p>
                                    <div className="mt-2"> <StarRating rating={recipe.rating} onRatingChange={(newRating) => updateRecipeInCookbook(recipe.id, { ...recipe, rating: newRating })} /> </div>
                                </div>
                                <div className="flex items-center gap-4 mt-2 sm:mt-0">
                                    <label className="flex items-center cursor-pointer">
                                        <span className="mr-2 text-sm font-medium text-stone-900">Öffentlich</span>
                                        <div className="relative">
                                            <input type="checkbox" checked={recipe.isPublic} onChange={(e) => updateRecipeInCookbook(recipe.id, { ...recipe, isPublic: e.target.checked })} className="sr-only peer" />
                                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-orange-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {cookbookView === 'pantry' && (
            <div>
                <h2 className="text-3xl font-bold text-stone-800 mb-6 flex items-center"><PantryIcon />Meine Vorratskammer</h2>
                <p className="text-stone-600 mb-4">Wähle aus, was du immer zu Hause hast.</p>
                
                <h3 className="text-xl font-semibold text-stone-800 mb-4 mt-6">Gängige Zutaten</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-3 mb-6 pb-6 border-b border-amber-200">
                    {COMMON_PANTRY_ITEMS.map(item => (
                        <label key={item} className="flex items-center space-x-2 cursor-pointer hover:text-orange-600">
                            <input
                                type="checkbox"
                                checked={(userData.pantry || []).includes(item)}
                                onChange={() => togglePantryItem(item)}
                                className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                            />
                            <span>{item}</span>
                        </label>
                    ))}
                </div>

                <h3 className="text-xl font-semibold text-stone-800 mb-4">Eigene Zutat hinzufügen</h3>
                <div className="flex gap-2 mb-4">
                    <input type="text" value={newPantryItem} onChange={(e) => setNewPantryItem(e.target.value)} placeholder="z.B. Speisestärke, Kokosmilch..." className="w-full p-2 border border-amber-300 rounded-md"/>
                    <button onClick={addPantryItem} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold">Hinzufügen</button>
                </div>

                <h3 className="text-xl font-semibold text-stone-800 mb-4 mt-6">Aktuell in der Vorratskammer</h3>
                {userData.pantry.length === 0 ? (
                    <p className="text-stone-500">Deine Vorratskammer ist leer.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {userData.pantry.sort().map((item, index) => (
                            <div key={index} className="flex items-center bg-amber-100 text-amber-800 rounded-full px-3 py-1 text-sm font-medium">
                                <span>{item}</span>
                                <button onClick={() => removePantryItem(item)} className="ml-2 text-amber-500 hover:text-red-500 font-bold">x</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}
        
        {cookbookView === 'friends' && (
            <div>
                <h2 className="text-3xl font-bold text-stone-800 mb-6 flex items-center"><FriendsIcon />Freundesliste</h2>
                <p className="text-stone-600 mb-4">Füge Freunde hinzu, um ihre öffentlichen Kochbücher einfach anzusehen.</p>
                <div className="flex gap-2 mb-6">
                    <input type="text" value={newFriendId} onChange={(e) => setNewFriendId(e.target.value)} placeholder="User ID des Freundes" className="w-full p-2 border border-amber-300 rounded-md"/>
                    <button onClick={addFriend} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold">Hinzufügen</button>
                </div>
                {(userData.friends || []).length === 0 ? (
                    <p className="text-stone-500">Du hast noch keine Freunde hinzugefügt.</p>
                ) : (
                    <div className="space-y-2">
                        {(userData.friends || []).map(id => (
                            <div key={id} className="flex justify-between items-center bg-amber-50 p-2 rounded-md">
                                <span className="font-mono text-sm text-stone-600">{id}</span>
                                <div>
                                    <button onClick={() => { setFriendId(id); viewFriendCookbook(); }} className="text-orange-600 hover:text-orange-800 mr-4">Ansehen</button>
                                    <button onClick={() => removeFriend(id)} className="text-red-500 hover:text-red-700">X</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}
    </div>
  );

  const renderMainContent = () => {
    // Fall 1: Startbildschirm
    if (!image) {
      return (
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-amber-200 text-center">
          <p className="text-stone-600 mb-6"> <span className="font-bold">Tipp:</span> Für beste Ergebnisse sollten die Zutaten auf dem Foto gut beleuchtet und deutlich zu erkennen sein. </p>
          <label htmlFor="file-upload" className="cursor-pointer group">
            <div className="border-2 border-dashed border-amber-300 rounded-xl p-8 hover:border-orange-500 hover:bg-amber-50 transition-colors duration-300">
              <svg className="mx-auto h-12 w-12 text-stone-400 group-hover:text-orange-600" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
              <p className="mt-4 text-sm text-stone-600"><span className="font-semibold text-orange-600">Foto hochladen</span> oder hierher ziehen</p>
            </div>
          </label>
          <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleImageChange} />
          <div className="mt-4 text-sm text-stone-600">oder<label htmlFor="camera-upload" className="ml-2 font-semibold text-orange-600 cursor-pointer hover:text-orange-500">Kamera verwenden</label>
            <input id="camera-upload" name="camera-upload" type="file" className="sr-only" accept="image/*" capture="environment" onChange={handleImageChange} />
          </div>
        </div>
      );
    }
    
    // Fall 2: Zutaten bearbeiten
    if (image && !isIngredientsConfirmed) {
        return (
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-amber-200 text-center transition-all duration-500">
                <img src={image} alt="Hochgeladene Zutaten" className="max-w-xs mx-auto rounded-lg shadow-md mb-4" />
                <div className="flex justify-center gap-4 text-sm mb-4">
                    <label htmlFor="file-upload-2" className="font-semibold text-orange-600 cursor-pointer hover:text-orange-500">Anderes Bild</label>
                    <input id="file-upload-2" type="file" className="sr-only" accept="image/*" onChange={handleImageChange} />
                    <span className="text-gray-400">|</span>
                    <label htmlFor="camera-upload-2" className="font-semibold text-orange-600 cursor-pointer hover:text-orange-500">Neues Foto</label>
                    <input id="camera-upload-2" type="file" className="sr-only" accept="image/*" capture="environment" onChange={handleImageChange} />
                </div>
                <h3 className="text-xl font-semibold text-stone-800 mb-2">Erkannte Zutaten</h3>
                <input type="text" value={ingredients} onChange={handleIngredientsChange} className="w-full p-2 border border-amber-300 rounded-md"/>
                <button onClick={findRecipes} disabled={loadingState.identifying || ingredients.length === 0} className="w-full mt-4 bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 disabled:bg-orange-300"> {loadingState.identifying ? 'Analysiere...' : 'Finde Rezepte'} </button>
            </div>
        );
    }

    // Fall 3: Rezeptauswahl
    if (recipes.length > 0 && !selectedRecipe && !pendingRecipeChoice) {
        return (
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-amber-200">
                <h2 className="text-2xl font-bold text-center text-stone-800 mb-6">Wähle ein Rezept</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recipes.filter(recipe => recipe && recipe.recipeName).map((recipe, index) => (
                        <div key={index} className="border border-amber-200 rounded-xl p-6 flex flex-col justify-between hover:shadow-md">
                            <div>
                                <h3 className="font-bold text-lg text-stone-800">{recipe.recipeName}</h3>
                                <div className="flex items-center mt-2 text-sm text-stone-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>{recipe.estimatedTime}</span></div>
                                <p className="text-sm text-stone-600 mt-2">{recipe.description}</p>
                                {recipe.requiredAppliances && recipe.requiredAppliances.length > 0 && <div className="mt-3"><h4 className="text-xs font-bold uppercase text-stone-400">Geräte</h4><p className="text-sm text-stone-600">{recipe.requiredAppliances.join(', ')}</p></div>}
                            </div>
                            <button onClick={() => handleRecipeSelect(recipe)} className="mt-4 w-full bg-amber-100 text-amber-800 px-4 py-2 rounded-lg font-semibold hover:bg-amber-200">Anleitung</button>
                        </div>
                    ))}
                </div>
                 <div className="text-center mt-8"><button onClick={handleReset} className="text-sm text-stone-600 hover:text-orange-600">Neue Suche starten</button></div>
            </div>
        );
    }
    
    // Fall 4: Ladeanzeige
    if (loadingState.finding || (loadingState.generating && !selectedRecipe)) { return ( <div className="bg-white p-8 rounded-2xl shadow-lg text-center"><div className="flex items-center justify-center text-lg font-semibold text-orange-600"><svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> {loadingState.finding ? 'Suche Rezepte...' : 'Erstelle Anleitung...'}</div></div> ); }

    // Fall 5: Rezept-Detailansicht
    if (selectedRecipe) {
      if (!selectedRecipe.recipeName) return null; 
      const isSaved = cookbook.some(r => r.id === selectedRecipe.recipeName.replace(/\s+/g, '-').toLowerCase());
      
      return (
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-amber-200">
          <div className="flex flex-col md:flex-row md:items-start justify-between mb-4">
            <div> <h2 className="text-3xl font-bold text-stone-800">{selectedRecipe.recipeName}</h2> <p className="mt-1 text-stone-600">{selectedRecipe.description}</p> </div>
            <div className="flex gap-2 mt-4 md:mt-0">
                <button onClick={handleBackToChoices} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300">Zurück</button>
                <button onClick={() => saveRecipeToCookbook(selectedRecipe)} disabled={isSaved} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-600 disabled:bg-orange-300 flex items-center gap-2"> <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg> {isSaved ? 'Gespeichert' : 'Speichern'} </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
            <div className="md:col-span-1">
                <h3 className="text-2xl font-bold text-stone-800 mb-4">Zutaten</h3>
                <ul className="list-disc list-inside space-y-1">
                    {selectedRecipe.ingredients && selectedRecipe.ingredients.map((item, index) => (
                        <li key={index} className="text-stone-700">
                            <span className="font-medium">{item.quantity}</span> {item.name}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="md:col-span-2 space-y-8">
                 {loadingState.generating && selectedRecipe.steps.length === 0 && (
                 <div className="text-center py-8">
                    <div className="flex items-center justify-center text-lg font-semibold text-orange-600"> <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Erstelle Anleitung... </div>
                    <p className="text-stone-500 mt-2">Die Bilder für die Anleitung werden generiert...</p>
                </div>
                )}
                {selectedRecipe.steps && selectedRecipe.steps.map((step, index) => (
                  <div key={index} className="flex flex-col sm:flex-row gap-6 p-4 border border-amber-200 rounded-xl bg-amber-50/50">
                    <div className="flex-shrink-0 sm:w-1-3">
                      {step.imageLoading ? ( <div className="w-full aspect-video bg-gray-200 rounded-lg flex items-center justify-center animate-pulse"><svg className="w-10 h-10 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg></div> ) : step.imageUrl ? ( <img src={step.imageUrl} alt={`Schritt ${index + 1}`} className="w-full h-full object-cover rounded-lg shadow-sm" /> ) : ( <div className="w-full aspect-video bg-red-100 rounded-lg flex items-center justify-center text-red-500"><p className="text-sm">Bildfehler</p></div> )}
                    </div>
                    <div className="flex-grow"> <h3 className="text-xl font-bold text-orange-600">Schritt {index + 1}</h3> <p className="mt-2 text-stone-700 leading-relaxed">{step.instruction}</p> </div>
                  </div>
                ))}
            </div>
          </div>
          {selectedRecipe.steps && selectedRecipe.steps.length > 0 && !loadingState.generating && (
              <div className="mt-8 pt-8 border-t border-amber-200">
                  <h3 className="text-2xl font-bold text-stone-800 mb-4">Kommentare</h3>
                  <div className="space-y-4 mb-6">
                      {comments.length > 0 ? comments.map(comment => (
                          <div key={comment.id} className="bg-amber-50 p-3 rounded-lg">
                              <p className="text-sm text-stone-800">{comment.text}</p>
                              <p className="text-xs text-stone-500 mt-1">Von: {comment.authorId.substring(0, 8)}...</p>
                          </div>
                      )) : <p className="text-stone-500">Noch keine Kommentare.</p>}
                  </div>
                  <div className="flex gap-2">
                      <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Dein Kommentar..." className="w-full p-2 border border-amber-300 rounded-md" rows="2"></textarea>
                      <button onClick={addComment} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold self-start">Senden</button>
                  </div>
              </div>
          )}
        </div>
      );
    }

    // Lade-Auswahl-Modal
    if (pendingRecipeChoice) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-sm">
                <h2 className="text-2xl font-bold mb-4">Anleitung erstellen</h2>
                <p className="text-gray-600 mb-6">Das Erstellen der Bilder für jeden Schritt dauert einen Moment. Wie möchten Sie fortfahren?</p>
                <div className="space-y-4">
                    <button onClick={() => generateRecipeDetails(pendingRecipeChoice, false)} className="w-full bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors">
                        Text sofort, Bilder im Hintergrund laden (Schnell)
                    </button>
                    <button onClick={() => generateRecipeDetails(pendingRecipeChoice, true)} className="w-full bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors">
                        Komplett laden (Langsamer)
                    </button>
                    <button onClick={() => setPendingRecipeChoice(null)} className="text-sm text-gray-500 hover:text-gray-700 mt-2">Abbrechen</button>
                </div>
            </div>
        </div>
      )
    }

    return null;
  }

  return (
    <div className="min-h-screen bg-amber-50 font-sans text-stone-800 antialiased">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        {renderHeader()}
        <main className="max-w-4xl mx-auto mt-6">
          {error && ( <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md shadow" role="alert"> <p className="font-bold">Ein Fehler ist aufgetreten</p> <p>{error}</p> </div> )}
          {currentView === 'main' ? renderMainContent() : renderCookbookView()}
        </main>
      </div>
    </div>
  );
}