<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Foto'n Cook</title>
    
    <!-- Einbindung von Tailwind CSS für das Styling -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Einbindung von React und ReactDOM -->
    <script src="https://unpkg.com/react@17/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@17/umd/react-dom.development.js"></script>
    
    <!-- Einbindung von Babel, um JSX im Browser zu übersetzen -->
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

    <!-- Einbindung der Lucide Icons -->
    <script src="https://unpkg.com/lucide-react@0.378.0/dist/lucide-react.js"></script>

    <style>
        /* Zusätzlicher Style für ein besseres Schriftbild */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body {
            font-family: 'Inter', sans-serif;
        }
    </style>
</head>
<body class="bg-gray-50">
    
    <!-- Das ist das HTML-Element, in das unsere React-App geladen wird -->
    <div id="root"></div>

    <script type="text/babel">
        // Deklarieren der Icons aus der Lucide-Bibliothek
        const { Camera, FileUp, UtensilsCrossed, ChefHat, Heart, LoaderCircle, AlertTriangle, X, Clock } = lucide;

        // Hilfsfunktion zum Konvertieren einer Datei in eine Base64-Zeichenkette
        const toBase64 = file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });

        // Hauptkomponente der Anwendung
        function App() {
            const [imageSrc, setImageSrc] = React.useState(null);
            const [ingredients, setIngredients] = React.useState([]);
            const [selectedIngredients, setSelectedIngredients] = React.useState(new Set());
            const [recipes, setRecipes] = React.useState([]);
            const [isLoading, setIsLoading] = React.useState(false);
            const [loadingMessage, setLoadingMessage] = React.useState('');
            const [errorMessage, setErrorMessage] = React.useState('');
            const [favorites, setFavorites] = React.useState(new Set());

            // Funktion zur Erkennung von Zutaten aus einem Bild
            const getIngredientsFromImage = React.useCallback(async (file) => {
                if (!file) return;

                setIsLoading(true);
                setLoadingMessage('Analysiere Foto...');
                setErrorMessage('');
                setIngredients([]);
                setRecipes([]);
                setSelectedIngredients(new Set());

                try {
                    const base64Image = await toBase64(file);
                    setImageSrc(base64Image);
                    const base64Data = base64Image.split(',')[1];

                    const apiKey = ""; // Wird von der Umgebung bereitgestellt
                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                    
                    const payload = {
                        contents: [
                            {
                                role: "user",
                                parts: [
                                    { text: "Identifiziere alle essbaren Zutaten auf diesem Bild. Liste sie als kommagetrennten Text auf. Beispiel: Tomaten, Zwiebeln, Knoblauch, Hähnchenbrust. Gib nur die Namen der Zutaten aus." },
                                    {
                                        inlineData: {
                                            mimeType: file.type,
                                            data: base64Data
                                        }
                                    }
                                ]
                            }
                        ]
                    };

                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const errorBody = await response.json();
                        console.error('API Error Response:', errorBody);
                        throw new Error(`API-Fehler: ${response.status} ${response.statusText}. Überprüfen Sie die Browser-Konsole für Details.`);
                    }

                    const result = await response.json();

                    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts[0].text) {
                        const ingredientsText = result.candidates[0].content.parts[0].text;
                        const ingredientsArray = ingredientsText.split(',').map(item => item.trim()).filter(Boolean);
                        setIngredients(ingredientsArray);
                        setSelectedIngredients(new Set(ingredientsArray));
                    } else {
                        console.error('Unerwartete API-Antwortstruktur:', result);
                        throw new Error('Die Zutatenerkennung ist fehlgeschlagen. Die API hat keine gültigen Daten zurückgegeben.');
                    }

                } catch (error) {
                    console.error(error);
                    setErrorMessage(`Fehler bei der Zutatenerkennung: ${error.message}`);
                    setImageSrc(null);
                } finally {
                    setIsLoading(false);
                    setLoadingMessage('');
                }
            }, []);
            
            // Funktion zum Umschalten der Zutatenauswahl
            const toggleIngredient = (ingredient) => {
                setSelectedIngredients(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(ingredient)) {
                        newSet.delete(ingredient);
                    } else {
                        newSet.add(ingredient);
                    }
                    return newSet;
                });
            };

            // Funktion zum Finden von Rezepten basierend auf den ausgewählten Zutaten
            const findRecipes = async () => {
                if (selectedIngredients.size === 0) {
                    setErrorMessage('Bitte wählen Sie mindestens eine Zutat aus.');
                    return;
                }

                setIsLoading(true);
                setLoadingMessage('Suche nach Rezepten...');
                setErrorMessage('');
                setRecipes([]);

                try {
                    const apiKey = ""; // Wird von der Umgebung bereitgestellt
                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                    const prompt = `Erstelle 3 einfache Rezeptideen basierend auf den folgenden Zutaten: ${[...selectedIngredients].join(', ')}. Gib das Ergebnis als JSON-Array zurück. Jedes Objekt im Array sollte die folgenden Eigenschaften haben: "recipeName" (string), "description" (string, eine kurze Beschreibung), "requiredIngredients" (array of strings), "instructions" (array of strings), "timeEstimate" (string, z.B. "ca. 30 Minuten"), und "kitchenTools" (array of strings, z.B. ["Pfanne", "Ofen"]).`;

                    const payload = {
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: "application/json",
                        }
                    };
                    
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const errorBody = await response.json();
                        console.error('API Error Response:', errorBody);
                        throw new Error(`API-Fehler: ${response.status} ${response.statusText}`);
                    }

                    const result = await response.json();
                    
                    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts[0].text) {
                         const recipesJson = result.candidates[0].content.parts[0].text;
                         const cleanedJson = recipesJson.replace(/```json|```/g, '').trim();
                         const parsedRecipes = JSON.parse(cleanedJson);
                         setRecipes(Array.isArray(parsedRecipes) ? parsedRecipes : []);
                    } else {
                         console.error('Unerwartete API-Antwortstruktur für Rezepte:', result);
                         throw new Error('Die Rezeptsuche ist fehlgeschlagen.');
                    }

                } catch (error) {
                    console.error(error);
                    setErrorMessage(`Fehler bei der Rezeptsuche: ${error.message}`);
                } finally {
                    setIsLoading(false);
                    setLoadingMessage('');
                }
            };

            // Funktion zum Umschalten der Favoriten
            const toggleFavorite = (recipeName) => {
                setFavorites(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(recipeName)) {
                        newSet.delete(recipeName);
                    } else {
                        newSet.add(recipeName);
                    }
                    return newSet;
                });
            };
            
            // Funktion zum Zurücksetzen des Zustands
            const handleReset = () => {
                setImageSrc(null);
                setIngredients([]);
                setSelectedIngredients(new Set());
                setRecipes([]);
                setErrorMessage('');
                setIsLoading(false);
                setLoadingMessage('');
            };

            return (
                <div className="container mx-auto p-4 md:p-8">
                    <header className="text-center mb-8">
                        <div className="flex justify-center items-center gap-3">
                           <ChefHat size={40} className="text-orange-500" />
                           <h1 className="text-4xl md:text-5xl font-bold text-gray-800">Foto'n Cook</h1>
                        </div>
                        <p className="text-gray-600 mt-2 text-lg">Fotografieren, was du hast. Kochen, was du liebst.</p>
                    </header>

                    {errorMessage && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md shadow-md flex justify-between items-center">
                            <div className="flex items-center">
                                <AlertTriangle className="mr-3" />
                                <span>{errorMessage}</span>
                            </div>
                            <button onClick={() => setErrorMessage('')} className="text-red-500 hover:text-red-700">
                                <X size={20} />
                            </button>
                        </div>
                    )}

                    {!imageSrc && !isLoading && (
                        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 text-center">
                            <h2 className="text-2xl font-semibold mb-4 text-gray-700">Lass uns starten!</h2>
                            <p className="text-gray-500 mb-6">Lade ein Foto deiner Zutaten hoch oder mache direkt eines.</p>
                            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                                <label htmlFor="file-upload" className="cursor-pointer w-full sm:w-auto bg-orange-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-orange-600 transition-transform transform hover:scale-105 flex items-center justify-center gap-2 shadow-sm">
                                    <FileUp size={20} />
                                    <span>Foto hochladen</span>
                                </label>
                                <input id="file-upload" type="file" accept="image/*" className="hidden" onChange={(e) => getIngredientsFromImage(e.target.files[0])} />
                                <span className="text-gray-400">oder</span>
                                <label htmlFor="camera-upload" className="cursor-pointer w-full sm:w-auto bg-gray-700 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-800 transition-transform transform hover:scale-105 flex items-center justify-center gap-2 shadow-sm">
                                    <Camera size={20} />
                                    <span>Kamera nutzen</span>
                                </label>
                                <input id="camera-upload" type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => getIngredientsFromImage(e.target.files[0])} />
                            </div>
                        </div>
                    )}
                    
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center bg-white p-8 rounded-xl shadow-lg border border-gray-200">
                            <LoaderCircle className="animate-spin text-orange-500 h-16 w-16 mb-4" />
                            <p className="text-xl font-semibold text-gray-700">{loadingMessage}</p>
                        </div>
                    )}

                    {imageSrc && !isLoading && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                <div className="relative">
                                    <img src={imageSrc} alt="Hochgeladene Zutaten" className="rounded-lg w-full h-auto object-cover max-h-96" />
                                    <button onClick={handleReset} className="absolute top-3 right-3 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-colors">
                                        <X size={20} />
                                    </button>
                                </div>
                                <h3 className="text-2xl font-bold mt-6 mb-4 text-gray-800">Erkannte Zutaten</h3>
                                {ingredients.length > 0 ? (
                                    <React.Fragment>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {ingredients.map(ing => (
                                                <label key={ing} className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors border ${selectedIngredients.has(ing) ? 'bg-orange-100 border-orange-400' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIngredients.has(ing)}
                                                        onChange={() => toggleIngredient(ing)}
                                                        className="form-checkbox h-5 w-5 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                                                    />
                                                    <span className="font-medium text-sm text-gray-700">{ing}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <button onClick={findRecipes} disabled={isLoading || selectedIngredients.size === 0} className="mt-6 w-full bg-green-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-600 transition-all flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed">
                                            <UtensilsCrossed size={20} />
                                            <span>Finde Rezepte ({selectedIngredients.size})</span>
                                        </button>
                                    </React.Fragment>
                                ) : (
                                    <p className="text-gray-500">Keine Zutaten erkannt. Versuchen Sie es mit einem anderen Bild.</p>
                                )}
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                <h3 className="text-2xl font-bold mb-4 text-gray-800">Rezeptideen</h3>
                                {recipes.length > 0 ? (
                                    <div className="space-y-4">
                                        {recipes.map((recipe, index) => (
                                            <div key={index} className="border border-gray-200 rounded-lg p-4 transition-shadow hover:shadow-md">
                                                <div className="flex justify-between items-start">
                                                    <h4 className="text-xl font-semibold text-orange-600 mb-2">{recipe.recipeName}</h4>
                                                    <button onClick={() => toggleFavorite(recipe.recipeName)} className="text-gray-400 hover:text-red-500 transition-colors">
                                                        <Heart size={24} className={favorites.has(recipe.recipeName) ? 'fill-current text-red-500' : ''} />
                                                    </button>
                                                </div>
                                                <p className="text-gray-600 mb-3 text-sm">{recipe.description}</p>
                                                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500 mb-4">
                                                    {recipe.timeEstimate && (
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock size={16} />
                                                            <span>{recipe.timeEstimate}</span>
                                                        </div>
                                                    )}
                                                    {recipe.kitchenTools && recipe.kitchenTools.length > 0 && (
                                                        <div className="flex items-center gap-1.5">
                                                            <UtensilsCrossed size={16} />
                                                            <span>{recipe.kitchenTools.join(', ')}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <h5 className="font-bold mb-1 text-gray-700">Zutaten:</h5>
                                                    <ul className="list-disc list-inside text-sm text-gray-600 mb-3">
                                                        {recipe.requiredIngredients.map((ing, i) => <li key={i}>{ing}</li>)}
                                                    </ul>
                                                    <h5 className="font-bold mb-1 text-gray-700">Anleitung:</h5>
                                                    <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
                                                        {recipe.instructions.map((step, i) => <li key={i}>{step}</li>)}
                                                    </ol>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-500 py-10">
                                        <ChefHat size={48} className="mx-auto text-gray-300 mb-4" />
                                        <p>Hier erscheinen deine Rezeptideen, sobald du eine Suche startest.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        // Rendert die App im 'root'-Element
        ReactDOM.render(<App />, document.getElementById('root'));
    </script>
</body>
</html>
