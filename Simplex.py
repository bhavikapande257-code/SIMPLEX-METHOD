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
        user_input = input(f"Enter the coefficient for the {i+1}th constraint(list): ")
        coefficients.append(user_input.split(" "))

        #Getting the signs
        user_input_sign = input(f"Enter the sign for the {i+1}th constraint(list): ")
        signs.append(user_input_sign)
        #Getting the rhs
        user_input_rhs = int(input(f"Enter the rhs for the {i+1}th constraint(list): "))
        rhs.append(user_input_rhs)
    return coefficients, signs, rhs, choice

def print_objective(obj,choice):
    print("\nObjective Function:")
    print( choice,"Z = ", end="")
    for i in range(len(obj)):
        print(obj[i], end="")
        print("x", end="")
        print(i+1, end="")
        if i != len(obj) - 1:
            print(" + ", end="")
    print()

def print_constraints(constraints, rhs, sign):
    print("\nConstraints:")
    for i in range(len(rhs)):
        for j in range(len(constraints[0])):
            print(f"{constraints[i][j]} x{j+1} ",end=" ")

            if j != len(constraints[0]) - 1:
                print(" + ", end="")
            else:
              if len(sign)==0:
                print("=", end="")
              else:
               if i>=0 and i<len(R)+1:
                print(sign[i-1] ,rhs[i])

def algebraic_manipulation(obj,constraints,sign,rhs,choice):
#    for i in range(len(sign)):
    #    if sign[i]=="<=": #slack variable s1 coefficient=0
    #        obj.append(0)
    #    elif sign[i]=="=":#artificial variable along with the penalty
    #        obj.append(100)
    #    else:
    #        obj.append(0)  
    try:
        
        for i in range(len(sign)):
            if sign[i]=="<"or "<=": #slack variable s1 coefficient=0
                obj.append(0)
                e = []
                for j in range(len(sign)):
                    if len(e) == i:
                        e.append(1)
                    else:
                        e.append(0)
                constraints[i].extend(e)

 
    except:
         print("Invalid sign")
    print_objective(obj,choice)
    print_constraints(constraints,rhs,"=") 

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
K=C[1::]

print_objective(C[0],choice)
print_constraints(K,R,S)
algebraic_manipulation(C[0],K, S, R, choice)
# table=convert_to_matrix()
# #Simplex
# optimal_value=simplex_manipulation(table)
# print(f"Optimal value is:{optimal_value}")

