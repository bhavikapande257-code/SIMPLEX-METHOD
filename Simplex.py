def get_input():

    coefficients = []
    signs = []
    rhs = []
    choice = input("Enter if the problem is maximiation or minimization: ")
    num_variables = int(input())
    num_constraints = int(input())
    #Getting the objective function
    user_input_one = input(f"Enter the coefficient for the objective function(list): ")
    coefficients.append(user_input_one.split(" "))

    #Getting the constraints
    for i in range(num_constraints):
        #Getting the constraints
        user_input = input(f"Enter the coefficient for the {i}th constraint(list): ")
        coefficients.append(user_input.split(" "))

        #Getting the signs
        user_input_sign = input(f"Enter the sign for the {i}th constraint(list): ")
        signs.append(user_input_sign)
        #Getting the rhs
        user_input_rhs = int(input(f"Enter the rhs for the {i}th constraint(list): "))
        rhs.append(user_input_rhs)
    return coefficients, signs, rhs, choice


def printfn(C,S,R,choice):
    print(choice,"\nZ =",end=" ")
    for i in range(len(R)+1):
        for j in range(len(C[0])):
            print(f"{C[i][j]} x{j+1} ",end=" ")
            if j!=len(R)-1:
              print("+ ",end=" ")
            else:
              if i>0 and i<len(R)+1:
               print(S[i-1] ,R[i-1])



        print("\n")
        if i==0:
            print("SUBJECT TO")
# def simplex_manipulation(table):
  #if Max or min of z row> or < 0
  #then stop iteration and return optimal value
  #else
  #choose_entering()
  #choose_leaving()
  #calculation
  #update optimal value
  #call itself(Send optimal value also)
  #declare the lists as global variables

# def main():

C,S,R,choice=get_input()
printfn(C,S,R,choice)
  # algebraic_manipulation()
  # table=convert_to_matrix()
  # #Simplex
  # optimal_value=simplex_manipulation(table)
  # print(f"Optimal value is:{optimal_value}")

