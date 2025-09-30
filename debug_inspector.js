// Simple test to debug inspector panel issues
console.log('=== Inspector Debug Test ===');

// Test 1: Check if basic JS works
console.log('Test 1: Basic JS - ', Date.now());

// Test 2: Check if timer logic works
let sessionStartTime = Date.now();
console.log('Test 2: Session start time - ', sessionStartTime);

function updateTimer() {
    const elapsed = Date.now() - sessionStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    const timeStr = hours > 0 ? 
        hours.toString().padStart(2, '0') + ':' + 
        minutes.toString().padStart(2, '0') + ':' + 
        seconds.toString().padStart(2, '0') :
        minutes.toString().padStart(2, '0') + ':' + 
        seconds.toString().padStart(2, '0');
        
    console.log('Timer: ', timeStr, 'Elapsed:', elapsed, 'ms');
    return timeStr;
}

// Test the timer
console.log('Test 3: Timer test - ', updateTimer());
setTimeout(() => {
    console.log('Test 4: Timer after 1 second - ', updateTimer());
}, 1000);