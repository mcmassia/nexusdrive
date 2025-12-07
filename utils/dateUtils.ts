
export const getSantoralName = (date: Date): string => {
    const month = date.getMonth(); // 0-11
    const day = date.getDate();

    // Simple dictionary for Demo purposes (focusing on Dec 2025 as per user context)
    // Can be expanded or replaced with a more robust solution later.
    const santoral: Record<string, string> = {
        '11-7': 'San Ambrosio', // Dec 7
        '11-8': 'Inmaculada Concepción',
        '11-9': 'San Juan Diego',
        '11-10': 'Nuestra Señora de Loreto',
        '11-11': 'San Dámaso I',
        '11-12': 'Nuestra Señora de Guadalupe',
        '11-13': 'Santa Lucía',
        '11-14': 'San Juan de la Cruz',
        '11-15': 'San Valeriano', // Example
        '11-24': 'Nochebuena',
        '11-25': 'Natividad del Señor',
        // ... add more as needed
    };

    const key = `${month}-${day}`;
    return santoral[key] || '';
};

export const formatHeaderDate = (date: Date, lang: 'en' | 'es' = 'es'): string => {
    const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    };

    const dateStr = date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', options);

    // Capitalize first letter
    const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    const saint = getSantoralName(date);

    if (saint) {
        return `${formattedDate}. ${saint}`;
    }

    return formattedDate;
};
