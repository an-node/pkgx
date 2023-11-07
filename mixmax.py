import math

def generate_spiral(rows, cols):
    spiral = [[' ' for _ in range(cols)] for _ in range(rows)]

    directions = [(0, 1), (1, 0), (0, -1), (-1, 0)]
    direction = 0

    num = rows * cols
    row, col = 0, 0

    for i in range(1, num + 1):
        spiral[row][col] = '#'
        next_row, next_col = row + directions[direction][0], col + directions[direction][1]

        if (0 <= next_row < rows and 0 <= next_col < cols) and (spiral[next_row][next_col] == ' '):
            row, col = next_row, next_col
        else:
            direction = (direction + 1) % 4
            row, col = row + directions[direction][0], col + directions[direction][1]

    return spiral

def print_spiral(spiral):
    for row in spiral:
        print(''.join(row))

rows, cols = 21, 15  # Modify as per your preference
spiral = generate_spiral(rows, cols)
print_spiral(spiral)
