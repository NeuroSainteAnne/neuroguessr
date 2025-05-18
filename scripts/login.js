async function refreshToken() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        console.log('No token found');
        return false;
    }

    try {
        const response = await fetch('/api/refresh-token', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            const result = await response.json();
            localStorage.setItem('authToken', result.token); // Save the new token
            console.log('Token refreshed successfully');
            return true;
        } else {
            console.error('Failed to refresh token:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Error refreshing token:', error);
        return false;
    }
}

function isTokenValid(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1])); // Decode the payload
        const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
        return payload.exp > currentTime; // Check if the token is still valid
    } catch (error) {
        console.error('Invalid token:', error);
        return false;
    }
}