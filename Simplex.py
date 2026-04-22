def get_input()
{
    coefficients = []
    signs = []
    rhs = []
    choice = input("Enter if the problem is maximiation or minimization: ")
    num_variables = input()
    num_constraints = input() 
    #Getting the objective function
    user_input_one = input(f"Enter the coefficient for the objective function(list): ") 
    coefficients.append(user_input_one)

    #Getting the constraints
    for i in range(num_constraints):
        #Getting the constraints
        user_input = input(f"Enter the coefficient for the {i}th constraint(list): ")
        coefficients.append(user_input)

        #Getting the signs
        user_input_sign = input(f"Enter the sign for the {i}th constraint(list): ")
        signs.append(user_input_sign)
        #Getting the rhs
        user_input_rhs = input(f"Enter the rhs for the {i}th constraint(list): ")
        rhs.append(user_input_rhs)
}
def main(){
    get_input()

}